import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as geoip from 'geoip-lite';
import { AnomalyFlag, DeviceSession } from '../../modules/database/entities';
import { AuditService } from '../audit/audit.service';

export interface GeoCheckResult {
  isAnomaly: boolean;
  distanceKm?: number;
  timeDeltaHours?: number;
  speedKmh?: number;
  actionTaken: 'log_only' | 'require_reverify' | 'blocked';
  currentLocation?: string;
  previousLocation?: string;
}

@Injectable()
export class GeoAnomalyService {
  private readonly logger = new Logger(GeoAnomalyService.name);
  private readonly maxInternationalSpeedKmh = 850; // Commercial airliner speed
  private readonly maxDomesticSpeedKmh = 130; // Max plausible ground/highway speed in Sri Lanka
  private readonly minDomesticDistanceKm = 60; // Ignore local ISP tower jitter (< 60km)

  constructor(
    @InjectRepository(AnomalyFlag)
    private readonly anomalyRepository: Repository<AnomalyFlag>,
    @InjectRepository(DeviceSession)
    private readonly deviceSessionRepository: Repository<DeviceSession>,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Resolves IP and Device Coordinates to Country, City, District and ISP.
   */
  resolveLocation(
    ip: string,
    deviceCoordsStr?: string,
  ): {
    locationStr: string;
    lat?: number;
    lon?: number;
    country?: string;
    city?: string;
  } {
    // Handle localhost / private IPs
    if (
      !ip ||
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.')
    ) {
      return { locationStr: 'Local/Dev Environment (Localhost)' };
    }

    const geo = geoip.lookup(ip);
    let resolvedIsp = '';
    if (ip.startsWith('112.134.') || ip.startsWith('112.135.')) {
      resolvedIsp = 'SLT-Mobitel';
    } else if (ip.startsWith('175.157.') || ip.startsWith('123.231.')) {
      resolvedIsp = 'Dialog';
    } else if (ip.startsWith('203.94.')) {
      resolvedIsp = 'Mobitel';
    }

    // 1. High-Precision Device GPS / WiFi Coordinates Layer
    if (deviceCoordsStr && deviceCoordsStr.includes(',')) {
      const [latStr, lonStr] = deviceCoordsStr.split(',');
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);

      if (!isNaN(lat) && !isNaN(lon)) {
        // Reverse-lookup closest Sri Lankan District/City
        const lkDistricts = [
          { name: 'Ratnapura, Sabaragamuwa', lat: 6.6828, lon: 80.4037 },
          { name: 'Colombo, Western', lat: 6.9271, lon: 79.8612 },
          { name: 'Kandy, Central', lat: 7.2906, lon: 80.6337 },
          { name: 'Galle, Southern', lat: 6.0535, lon: 80.221 },
          { name: 'Gampaha, Western', lat: 7.084, lon: 80.0098 },
          { name: 'Kurunegala, North Western', lat: 7.4863, lon: 80.3623 },
          { name: 'Matara, Southern', lat: 5.9549, lon: 80.555 },
          { name: 'Jaffna, Northern', lat: 9.6615, lon: 80.0255 },
          { name: 'Badulla, Uva', lat: 6.9934, lon: 81.055 },
          { name: 'Kalutara, Western', lat: 6.5854, lon: 79.9607 },
          { name: 'Anuradhapura, North Central', lat: 8.3114, lon: 80.4037 },
          { name: 'Kegalle, Sabaragamuwa', lat: 7.2513, lon: 80.3464 },
          { name: 'Trincomalee, Eastern', lat: 8.5874, lon: 81.2152 },
          { name: 'Batticaloa, Eastern', lat: 7.731, lon: 81.6747 },
        ];

        let closestTown = 'Sri Lanka';
        let minDistance = Infinity;

        for (const dist of lkDistricts) {
          const dLat = (lat - dist.lat) * 111;
          const dLon = (lon - dist.lon) * 111 * Math.cos((lat * Math.PI) / 180);
          const dKm = Math.sqrt(dLat * dLat + dLon * dLon);
          if (dKm < minDistance) {
            minDistance = dKm;
            closestTown = dist.name;
          }
        }

        const ispTag = resolvedIsp ? ` • ${resolvedIsp}` : '';
        return {
          locationStr: `${closestTown}, LK (GPS)${ispTag}`,
          lat,
          lon,
          country: 'LK',
          city: closestTown,
        };
      }
    }

    // 2. Fallback to ISP Network Gateway Geolocation
    if (!geo) {
      return { locationStr: resolvedIsp ? `Sri Lanka (${resolvedIsp})` : 'Unknown Region' };
    }

    const cityStr = geo.city ? geo.city : 'Sri Lanka';
    const ispTag = resolvedIsp ? ` (${resolvedIsp})` : '';
    const parts = [`${cityStr}${ispTag}`, geo.region, geo.country].filter(Boolean);

    return {
      locationStr: parts.join(', ') || geo.country || 'Global',
      lat: geo.ll ? geo.ll[0] : undefined,
      lon: geo.ll ? geo.ll[1] : undefined,
      country: geo.country,
      city: geo.city,
    };
  }

  /**
   * Evaluates if a new request from an IP represents an impossible-travel geo-anomaly.
   */
  async checkAnomaly(
    userId: string,
    sessionId: string,
    currentIp: string,
  ): Promise<GeoCheckResult> {
    const configuredAction =
      (this.configService.get<string>('GEO_ANOMALY_ACTION') as
        | 'log_only'
        | 'require_reverify'
        | 'blocked') || 'log_only';

    const currentGeo = this.resolveLocation(currentIp);

    // Find the most recent distinct session for this user
    const previousSession = await this.deviceSessionRepository.findOne({
      where: { userId },
      order: { lastSeenAt: 'DESC' },
    });

    if (!previousSession || !previousSession.ip || previousSession.ip === currentIp) {
      return {
        isAnomaly: false,
        actionTaken: configuredAction,
        currentLocation: currentGeo.locationStr,
      };
    }

    const prevGeo = this.resolveLocation(previousSession.ip);

    // If coordinates are missing for either location, cannot compute distance
    if (!currentGeo.lat || !currentGeo.lon || !prevGeo.lat || !prevGeo.lon) {
      return {
        isAnomaly: false,
        actionTaken: configuredAction,
        currentLocation: currentGeo.locationStr,
        previousLocation: prevGeo.locationStr,
      };
    }

    // Compute Haversine distance
    const distanceKm = this.calculateHaversineDistance(
      prevGeo.lat,
      prevGeo.lon,
      currentGeo.lat,
      currentGeo.lon,
    );

    // Compute time delta in hours
    const now = Date.now();
    const prevTime = new Date(previousSession.lastSeenAt || previousSession.issuedAt).getTime();
    const timeDeltaMs = Math.max(now - prevTime, 1000); // minimum 1s to prevent division by 0
    const timeDeltaHours = timeDeltaMs / (1000 * 60 * 60);

    const speedKmh = distanceKm / timeDeltaHours;

    // Detect if travel is domestic (within Sri Lanka) or international
    const isDomestic = (currentGeo.country === 'LK' && prevGeo.country === 'LK') || distanceKm < 500;
    const effectiveMaxSpeed = isDomestic ? this.maxDomesticSpeedKmh : this.maxInternationalSpeedKmh;
    const effectiveMinDistance = isDomestic ? this.minDomesticDistanceKm : 300;

    if (
      distanceKm >= effectiveMinDistance &&
      speedKmh > effectiveMaxSpeed
    ) {
      this.logger.warn(
        `[GEO ANOMALY] Impossible travel detected for user="${userId}"! Distance: ${distanceKm.toFixed(0)}km in ${(timeDeltaHours * 60).toFixed(1)} mins (Speed: ${speedKmh.toFixed(0)} km/h, Limit: ${effectiveMaxSpeed} km/h). Action: ${configuredAction}`,
      );

      // Record in anomaly_flags table
      const anomaly = this.anomalyRepository.create({
        userId,
        sessionId,
        currentIp,
        prevIp: previousSession.ip,
        currentGeo: currentGeo.locationStr,
        prevGeo: prevGeo.locationStr,
        distanceKm: Math.round(distanceKm),
        timeDeltaHours: Math.round(timeDeltaHours * 100) / 100,
        implausibleSpeedKmh: Math.round(speedKmh),
        actionTaken: configuredAction,
      });
      await this.anomalyRepository.save(anomaly);

      // Record in structured audit log
      await this.auditService.logEvent({
        eventType: 'ANOMALY_FLAGGED',
        userId,
        sessionId,
        ip: currentIp,
        metadata: {
          prevIp: previousSession.ip,
          currentLocation: currentGeo.locationStr,
          prevLocation: prevGeo.locationStr,
          distanceKm: Math.round(distanceKm),
          speedKmh: Math.round(speedKmh),
          actionTaken: configuredAction,
        },
      });

      return {
        isAnomaly: true,
        distanceKm: Math.round(distanceKm),
        timeDeltaHours: Math.round(timeDeltaHours * 100) / 100,
        speedKmh: Math.round(speedKmh),
        actionTaken: configuredAction,
        currentLocation: currentGeo.locationStr,
        previousLocation: prevGeo.locationStr,
      };
    }

    return {
      isAnomaly: false,
      distanceKm: Math.round(distanceKm),
      timeDeltaHours: Math.round(timeDeltaHours * 100) / 100,
      speedKmh: Math.round(speedKmh),
      actionTaken: configuredAction,
      currentLocation: currentGeo.locationStr,
      previousLocation: prevGeo.locationStr,
    };
  }

  /**
   * Haversine formula to compute great-circle distance between two GPS coordinates in kilometers.
   */
  calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's mean radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  async getRecentAnomalies(limit = 50): Promise<AnomalyFlag[]> {
    return await this.anomalyRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
