import {
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSession } from '../../modules/database/entities';
import { SessionLimitService } from '../session-limits/session-limit.service';
import { GeoAnomalyService } from '../geo-anomaly/geo-anomaly.service';
import { AuditService } from '../audit/audit.service';

export interface RegisterSessionPayload {
  userId: string;
  sessionId: string;
  deviceFingerprint: string;
  ip: string;
  userAgent?: string;
  deviceCoords?: string;
}

@Injectable()
export class DeviceBindingService {
  private readonly logger = new Logger(DeviceBindingService.name);

  constructor(
    @InjectRepository(DeviceSession)
    private readonly deviceSessionRepository: Repository<DeviceSession>,
    private readonly sessionLimitService: SessionLimitService,
    private readonly geoAnomalyService: GeoAnomalyService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Registers a new session or updates lastSeen timestamp.
   * Performs Geo-Anomaly check and enforces concurrency limits.
   */
  async registerOrTouchSession(payload: RegisterSessionPayload): Promise<DeviceSession> {
    const { userId, sessionId, deviceFingerprint, ip, userAgent, deviceCoords } = payload;
    const geo = this.geoAnomalyService.resolveLocation(ip, deviceCoords);

    let session = await this.deviceSessionRepository.findOne({
      where: { sessionId },
    });

    if (!session) {
      // 1. Run Geo-Anomaly Impossible Travel evaluation
      const geoResult = await this.geoAnomalyService.checkAnomaly(userId, sessionId, ip);

      if (geoResult.isAnomaly && geoResult.actionTaken === 'blocked') {
        throw new ForbiddenException(
          'Access blocked due to impossible travel / severe geolocation anomaly detected.',
        );
      }

      // 2. Enforce concurrent session limit (evicts oldest session if > 2)
      await this.sessionLimitService.enforceLimit(userId, sessionId, 2);

      // 3. Create bound device session record
      session = this.deviceSessionRepository.create({
        userId,
        sessionId,
        deviceFingerprint,
        ip,
        userAgent: userAgent || 'Unknown Browser',
        location: geo.locationStr,
        isRevoked: false,
        revokedReason: null,
      });

      await this.deviceSessionRepository.save(session);

      // 4. Audit Log
      await this.auditService.logEvent({
        eventType: 'SESSION_CREATED',
        userId,
        sessionId,
        ip,
        userAgent,
        deviceFingerprintHash: deviceFingerprint,
        metadata: {
          location: geo.locationStr,
          isAnomaly: geoResult.isAnomaly,
        },
      });

      this.logger.log(
        `[DEVICE BINDING] Bound session="${sessionId}" to user="${userId}" with fingerprint="${deviceFingerprint.slice(0, 10)}..." (IP=${ip}, Location=${geo.locationStr})`,
      );
    } else {
      // Update last seen
      if (session.isRevoked) {
        throw new UnauthorizedException({
          code: 'SESSION_EVICTED',
          message:
            session.revokedReason === 'EVICTED_CONCURRENCY_LIMIT'
              ? 'Your session was signed out because your account reached the maximum concurrent device limit.'
              : 'This device session has been revoked.',
        });
      }

      session.lastSeenAt = new Date();
      if (
        deviceFingerprint &&
        deviceFingerprint !== 'unknown' &&
        deviceFingerprint !== 'web_default_fp'
      ) {
        session.deviceFingerprint = deviceFingerprint;
      }
      if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        session.ip = ip;
        session.location = geo.locationStr;
      }
      await this.deviceSessionRepository.save(session);
    }

    return session;
  }

  /**
   * Verifies that incoming request fingerprint matches the bound session fingerprint.
   * Throws 401 if session is evicted/revoked, or 403 if fingerprint does not match.
   */
  async verifyBinding(
    userId: string,
    sessionId: string,
    incomingFingerprint?: string,
    ip = '127.0.0.1',
    userAgent = 'Unknown',
    deviceCoords?: string,
  ): Promise<boolean> {
    if (!sessionId) return true; // Fallback if session ID is omitted

    const session = await this.deviceSessionRepository.findOne({
      where: { sessionId },
    });

    if (!session) {
      // If session not yet registered, register it now
      if (incomingFingerprint) {
        await this.registerOrTouchSession({
          userId,
          sessionId,
          deviceFingerprint: incomingFingerprint,
          ip,
          userAgent,
          deviceCoords,
        });
      }
      return true;
    }

    // Auto-update session IP and location when receiving real client public IP or device coordinates
    if (
      (ip && ip !== '127.0.0.1' && ip !== '::1') ||
      deviceCoords
    ) {
      const geo = this.geoAnomalyService.resolveLocation(ip || session.ip, deviceCoords);
      if (ip && ip !== '127.0.0.1' && ip !== '::1') session.ip = ip;
      session.location = geo.locationStr;
      await this.deviceSessionRepository.save(session);
    }

    // Check if session was evicted or revoked
    if (session.isRevoked) {
      this.logger.warn(
        `[DEVICE BINDING] Access denied: Session "${sessionId}" for user="${userId}" is revoked (${session.revokedReason})`,
      );
      throw new UnauthorizedException({
        code: 'SESSION_EVICTED',
        message:
          session.revokedReason === 'EVICTED_CONCURRENCY_LIMIT'
            ? 'Playback stopped: Your account was opened on another device exceeding the concurrent stream limit.'
            : 'This device session has been revoked by the account owner.',
      });
    }

    // Check fingerprint match if provided
    if (incomingFingerprint && incomingFingerprint !== 'unknown' && incomingFingerprint !== 'web_default_fp') {
      if (
        session.deviceFingerprint === 'web_default_fp' ||
        session.deviceFingerprint === 'unknown' ||
        !session.deviceFingerprint
      ) {
        session.deviceFingerprint = incomingFingerprint;
        await this.deviceSessionRepository.save(session);
      } else if (session.deviceFingerprint !== incomingFingerprint) {
        const isDesktopClient =
          incomingFingerprint.includes('desktop_hw') ||
          userAgent.toLowerCase().includes('electron') ||
          userAgent.toLowerCase().includes('eduone') ||
          userAgent.toLowerCase().includes('fonixedu');

        if (isDesktopClient) {
          this.logger.log(
            `[DEVICE BINDING] Seamlessly bound session="${sessionId}" for user="${userId}" to desktop hardware fingerprint="${incomingFingerprint.slice(0, 10)}..."`,
          );
          session.deviceFingerprint = incomingFingerprint;
          if (userAgent && userAgent !== 'Unknown') session.userAgent = userAgent;
          await this.deviceSessionRepository.save(session);
        } else {
          this.logger.warn(
            `[DEVICE BINDING MISMATCH] Token replay detected! User="${userId}", Session="${sessionId}". Bound fingerprint="${session.deviceFingerprint.slice(0, 10)}...", Incoming="${incomingFingerprint.slice(0, 10)}..."`,
          );

          await this.auditService.logEvent({
            eventType: 'FINGERPRINT_MISMATCH',
            userId,
            sessionId,
            ip,
            userAgent,
            deviceFingerprintHash: incomingFingerprint,
            metadata: {
              boundFingerprint: session.deviceFingerprint,
              incomingFingerprint,
            },
          });

          throw new ForbiddenException({
            code: 'DEVICE_FINGERPRINT_MISMATCH',
            message:
              'Access denied: This playback session token is bound to a different device. Token replay is blocked.',
          });
        }
      }
    }

    // Touch session lastSeen
    session.lastSeenAt = new Date();
    await this.deviceSessionRepository.save(session);

    return true;
  }

  /**
   * Returns all active and historical device sessions for a user.
   */
  async getUserSessions(userId: string): Promise<DeviceSession[]> {
    return await this.deviceSessionRepository.find({
      where: { userId },
      order: { lastSeenAt: 'DESC' },
    });
  }

  /**
   * Revokes a device session (user-initiated or admin-initiated).
   */
  async revokeSession(
    userId: string,
    sessionId: string,
    reason = 'USER_REVOKED',
  ): Promise<boolean> {
    const session = await this.deviceSessionRepository.findOne({
      where: { sessionId },
    });

    if (!session) return false;

    session.isRevoked = true;
    session.revokedReason = reason;
    await this.deviceSessionRepository.save(session);

    await this.auditService.logEvent({
      eventType: 'DEVICE_REVOKED',
      userId: session.userId,
      sessionId: session.sessionId,
      ip: session.ip,
      metadata: { reason },
    });

    this.logger.log(
      `[DEVICE BINDING] Session "${sessionId}" revoked for user="${userId}" (Reason: ${reason})`,
    );

    return true;
  }
}
