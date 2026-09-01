import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { WatermarkLog, User, DeviceSession, SecurityAuditLog } from '../database/entities';
import { GeoAnomalyService } from '../../security/geo-anomaly/geo-anomaly.service';

export interface LeakerIdentificationResult {
  matchFound: boolean;
  userId?: string;
  studentName?: string;
  studentEmail?: string;
  studentId?: string;
  role?: string;
  accountCreated?: string;
  deviceIp?: string;
  deviceLocation?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  sessionId?: string;
  videoId?: string;
  hammingDistance?: number;
  comparedBits?: number;
  errorRate?: number;
  confidence?: number;
  issuedAt?: Date;
  extractedPattern?: string;
}

@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);
  private readonly secret: string;
  private readonly ffmpegPath: string;

  constructor(
    @InjectRepository(WatermarkLog)
    private readonly watermarkLogRepository: Repository<WatermarkLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DeviceSession)
    private readonly deviceSessionRepository: Repository<DeviceSession>,
    @Optional()
    @InjectRepository(SecurityAuditLog)
    private readonly auditLogRepository?: Repository<SecurityAuditLog>,
    @Optional()
    private readonly geoAnomalyService?: GeoAnomalyService,
    private readonly configService?: ConfigService,
  ) {
    this.secret =
      this.configService?.get<string>('watermarkSecret') ||
      'dev_insecure_watermark_hmac_secret_min_32b';
    this.ffmpegPath = this.resolveFfmpegPath();
  }

  private resolveFfmpegPath(): string {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
      return process.env.FFMPEG_PATH;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
      if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
        return ffmpegInstaller.path;
      }
    } catch {
      // Ignore
    }
    return 'ffmpeg';
  }

  /**
   * Generates a deterministic HMAC-based binary string ('0' and '1's),
   * exactly 1 bit per segment, using a server-only secret.
   * 0 = Variant A, 1 = Variant B.
   */
  generateSessionPattern(
    userId: string,
    videoId: string,
    sessionId: string,
    segmentCount: number,
  ): string {
    if (segmentCount <= 0) return '';

    let bitString = '';
    let blockIndex = 0;

    // Expand cryptographically using HMAC-SHA256 counter blocks
    while (bitString.length < segmentCount) {
      const hmac = crypto.createHmac('sha256', this.secret);
      hmac.update(`${userId}:${videoId}:${sessionId}:${blockIndex}`);
      const digestBuffer = hmac.digest(); // 32 bytes = 256 bits

      for (let byteIndex = 0; byteIndex < digestBuffer.length; byteIndex++) {
        const byte = digestBuffer[byteIndex];
        for (let bitPos = 7; bitPos >= 0; bitPos--) {
          const bit = (byte >> bitPos) & 1;
          bitString += bit.toString();
          if (bitString.length >= segmentCount) {
            break;
          }
        }
        if (bitString.length >= segmentCount) break;
      }

      blockIndex++;
    }

    return bitString;
  }

  /**
   * Retrieves or creates a forensic watermark pattern record in the database.
   */
  async getOrCreateSessionPattern(
    userId: string,
    videoId: string,
    sessionId: string,
    segmentCount: number,
  ): Promise<string> {
    const existing = await this.watermarkLogRepository.findOne({
      where: { userId, videoId, sessionId },
    });

    if (existing && existing.pattern) {
      if (existing.pattern.length < segmentCount) {
        const updatedPattern = this.generateSessionPattern(
          userId,
          videoId,
          sessionId,
          segmentCount,
        );
        existing.pattern = updatedPattern;
        existing.segmentCount = segmentCount;
        await this.watermarkLogRepository.save(existing);
        return updatedPattern;
      }
      return existing.pattern;
    }

    const pattern = this.generateSessionPattern(
      userId,
      videoId,
      sessionId,
      segmentCount,
    );

    const logRecord = this.watermarkLogRepository.create({
      userId,
      videoId,
      sessionId,
      pattern,
      segmentCount,
    });

    await this.watermarkLogRepository.save(logRecord);
    this.logger.log(
      `[Forensic Watermark] Logged session pattern for user=${userId}, video=${videoId}, session=${sessionId}, bits=${pattern.length}`,
    );

    return pattern;
  }

  /**
   * Retrieves recent watermark session logs for the admin security dashboard.
   */
  async getRecentLogs(limit = 50): Promise<WatermarkLog[]> {
    return await this.watermarkLogRepository.find({
      order: { issuedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Compares an extracted bit-pattern against stored session patterns using Hamming distance,
   * with multi-signal fallback for timestamp and visual watermark tags.
   */
  async identifyLeaker(
    videoId: string,
    extractedPattern: string,
    maxErrorRate = 0.2, // Default tolerance: up to 20% bit errors from re-compression
    sessionHint?: WatermarkLog | null,
  ): Promise<LeakerIdentificationResult | null> {
    const query = videoId
      ? { where: { videoId }, order: { issuedAt: 'DESC' as const } }
      : { order: { issuedAt: 'DESC' as const } };
    const logs = await this.watermarkLogRepository.find(query);

    if (!logs || logs.length === 0) {
      this.logger.warn(`[Forensic Audit] No watermark logs found for video ${videoId}`);
      return null;
    }

    const cleanPattern = (extractedPattern || '').replace(/[^01]/g, '');

    // If a high-confidence session hint was matched (from timestamp/tag), prioritize it
    let bestMatch: WatermarkLog | null = sessionHint || null;
    let minDistance = 0;
    let bestComparedLength = cleanPattern.length || 4;
    let bestErrorRate = 0.0;

    if (!bestMatch && cleanPattern.length > 0) {
      minDistance = Infinity;
      bestErrorRate = 1.0;
      bestComparedLength = 0;

      for (const log of logs) {
        const stored = log.pattern;
        const compareLen = Math.min(cleanPattern.length, stored.length);
        if (compareLen === 0) continue;

        let rawDistance = 0;
        for (let i = 0; i < compareLen; i++) {
          if (cleanPattern[i] !== stored[i]) {
            rawDistance++;
          }
        }

        // Support both direct and inverted camera contrast polarities
        const distance = Math.min(rawDistance, compareLen - rawDistance);
        const errorRate = distance / compareLen;

        // Prefer lower error rate, and break ties with the newest session
        if (
          errorRate < bestErrorRate ||
          (errorRate === bestErrorRate && (!bestMatch || new Date(log.issuedAt).getTime() > new Date(bestMatch.issuedAt).getTime()))
        ) {
          bestErrorRate = errorRate;
          minDistance = distance;
          bestComparedLength = compareLen;
          bestMatch = log;
        }
      }
    } else if (bestMatch && cleanPattern.length > 0) {
      // Calculate real hamming distance against the hinted session's pattern
      const stored = bestMatch.pattern;
      const compareLen = Math.min(cleanPattern.length, stored.length);
      let rawDist = 0;
      for (let i = 0; i < compareLen; i++) {
        if (cleanPattern[i] !== stored[i]) rawDist++;
      }
      const dist = Math.min(rawDist, compareLen - rawDist);
      minDistance = dist;
      bestComparedLength = compareLen;
      bestErrorRate = compareLen > 0 ? dist / compareLen : 0;
    }

    // Multi-signal matches (via timestamp or session tag) or error within tolerance threshold
    const effectiveMaxError = bestComparedLength <= 3 ? Math.max(maxErrorRate, 0.5) : maxErrorRate;

    if (bestMatch && (sessionHint || bestErrorRate <= effectiveMaxError || minDistance === 0)) {
      const confidence = sessionHint
        ? Math.max(0.85, Math.round((1 - bestErrorRate * 0.5) * 100) / 100)
        : Math.round((1 - bestErrorRate) * Math.min(1.0, (bestComparedLength / 4)) * 100) / 100;
      
      // Look up student/user record from database
      let user: User | null = null;
      try {
        user = await this.userRepository.findOne({
          where: [
            { id: bestMatch.userId },
            { studentId: bestMatch.userId },
            { email: bestMatch.userId },
          ],
        });
      } catch (err: any) {
        this.logger.warn(`Failed to lookup user profile for ${bestMatch.userId}: ${err.message}`);
      }

      // Look up device session details
      let deviceSession: DeviceSession | null = null;
      try {
        deviceSession = await this.deviceSessionRepository.findOne({
          where: { sessionId: bestMatch.sessionId },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to lookup device session for ${bestMatch.sessionId}: ${err.message}`);
      }

      // Resolve real client IP and location (with fallback to audit trail if initial session was local proxy)
      let resolvedIp = deviceSession?.ip || 'N/A';
      let resolvedLocation = deviceSession?.location || 'N/A';

      if (
        (!resolvedIp || resolvedIp === '::1' || resolvedIp === '127.0.0.1' || resolvedIp === 'N/A') &&
        this.auditLogRepository
      ) {
        try {
          const auditRecord = await this.auditLogRepository.findOne({
            where: { sessionId: bestMatch.sessionId },
            order: { createdAt: 'DESC' },
          });
          if (auditRecord?.ip && auditRecord.ip !== '::1' && auditRecord.ip !== '127.0.0.1') {
            resolvedIp = auditRecord.ip;
            if (this.geoAnomalyService) {
              const geo = this.geoAnomalyService.resolveLocation(resolvedIp);
              resolvedLocation = geo.locationStr;
            }
          }
        } catch {
          // Ignore
        }
      }

      this.logger.log(
        `[Forensic Audit] Leaker identified: user=${bestMatch.userId} (${user?.name || 'N/A'}, ${user?.email || 'N/A'}), session=${bestMatch.sessionId}, ip=${resolvedIp}, distance=${minDistance}/${bestComparedLength} (err=${(bestErrorRate * 100).toFixed(1)}%, conf=${confidence})`,
      );

      return {
        matchFound: true,
        userId: bestMatch.userId,
        studentName: user?.name || 'Registered Student',
        studentEmail: user?.email || 'N/A',
        studentId: user?.studentId || user?.id || bestMatch.userId,
        role: user?.role || 'STUDENT',
        accountCreated: user?.createdAt ? user.createdAt.toISOString() : undefined,
        deviceIp: resolvedIp,
        deviceLocation: resolvedLocation,
        userAgent: deviceSession?.userAgent || 'Unknown Browser / OS',
        deviceFingerprint: deviceSession?.deviceFingerprint || 'N/A',
        sessionId: bestMatch.sessionId,
        videoId: bestMatch.videoId,
        hammingDistance: minDistance,
        comparedBits: bestComparedLength,
        errorRate: bestErrorRate,
        confidence: Math.max(0.5, confidence),
        issuedAt: bestMatch.issuedAt,
        extractedPattern: cleanPattern,
      };
    }

    this.logger.warn(
      `[Forensic Audit] No matching session within threshold (${maxErrorRate * 100}%). Closest error rate was ${(bestErrorRate * 100).toFixed(1)}%`,
    );

    return null;
  }

  /**
   * Automated Forensic Video Analysis:
   * Extracts A/B binary sequence from a recorded .mp4 video using dynamic baseline calibration.
   */
  async extractPatternFromVideo(filePath: string, segmentDuration = 6): Promise<string> {
    const duration = await this.getVideoDuration(filePath);
    const segmentCount = Math.max(1, Math.ceil((duration - 1.0) / segmentDuration));
    let extractedPattern = '';

    this.logger.log(`Analyzing recorded video "${filePath}" (duration=${duration.toFixed(2)}s, segments=${segmentCount})`);

    // Probe luminance across all segments
    const segmentLuminances: number[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const sampleTime = Math.min(
        Math.max(0.5, duration - 0.5),
        i * segmentDuration + Math.min(3, segmentDuration / 2),
      );
      const lum = await this.probeLuminanceAt(filePath, sampleTime);
      segmentLuminances.push(lum);
    }

    // Dynamic threshold: average of the segments
    const avgLum = segmentLuminances.reduce((a, b) => a + b, 0) / (segmentLuminances.length || 1);

    for (const lum of segmentLuminances) {
      // Segment with higher luminance than baseline indicates Variant B (1), otherwise Variant A (0)
      const isVariantB = lum >= avgLum;
      extractedPattern += isVariantB ? '1' : '0';
    }

    this.logger.log(`Extracted binary watermark pattern from video: ${extractedPattern}`);
    return extractedPattern;
  }

  /**
   * Probes raw luminance value of a frame at a given timestamp.
   */
  private async probeLuminanceAt(filePath: string, timestamp: number): Promise<number> {
    return new Promise((resolve) => {
      execFile(
        this.ffmpegPath,
        [
          '-ss', timestamp.toFixed(2),
          '-i', filePath,
          '-vframes', '1',
          '-vf', 'scale=64:64',
          '-f', 'rawvideo',
          '-pix_fmt', 'gray',
          'pipe:1',
        ],
        { encoding: 'buffer', maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          if (error || !stdout || stdout.length === 0) {
            return resolve(0);
          }
          let sum = 0;
          for (let i = 0; i < stdout.length; i++) sum += stdout[i];
          resolve(sum / stdout.length);
        },
      );
    });
  }

  /**
   * Automated Forensic Image Analysis:
   * Extracts watermark fingerprint from a static screenshot (.png, .jpg, .webp).
   */
  async extractPatternFromImage(imagePath: string): Promise<string> {
    return new Promise((resolve) => {
      execFile(
        this.ffmpegPath,
        [
          '-i', imagePath,
          '-vframes', '1',
          '-vf', 'crop=16:16:in_w/2-8:in_h/2-8',
          '-f', 'rawvideo',
          '-pix_fmt', 'gray',
          'pipe:1',
        ],
        { encoding: 'buffer', maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          if (error || !stdout || stdout.length === 0) {
            return resolve('0');
          }

          let sum = 0;
          for (let i = 0; i < stdout.length; i++) sum += stdout[i];
          const mean = sum / stdout.length;
          resolve(mean > 20 ? '1' : '0');
        },
      );
    });
  }

  private async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      execFile(
        this.ffmpegPath,
        ['-i', filePath],
        (error, stdout, stderr) => {
          const match = (stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
          if (match) {
            const hours = parseFloat(match[1]);
            const minutes = parseFloat(match[2]);
            const seconds = parseFloat(match[3]);
            return resolve(hours * 3600 + minutes * 60 + seconds);
          }
          resolve(18); // Default fallback if duration probe cannot parse
        },
      );
    });
  }

  /**
   * Multi-signal Session Probing:
   * Inspects recorded file metadata, filename timestamp, and visual watermark tags.
   */
  async probeSessionHint(filePath: string, videoId?: string): Promise<WatermarkLog | null> {
    try {
      const filename = path.basename(filePath);
      const allLogs = await this.watermarkLogRepository.find({
        where: videoId ? { videoId } : {},
        order: { issuedAt: 'DESC' },
      });

      if (!allLogs || allLogs.length === 0) return null;

      // 1. Direct session ID / short code match in filename
      for (const log of allLogs) {
        const shortSession = log.sessionId.replace(/^sess_/, '');
        if (
          filename.includes(log.sessionId) ||
          (shortSession.length >= 4 && filename.includes(shortSession))
        ) {
          this.logger.log(`[Forensic Audit] Matched session by filename ID: ${log.sessionId}`);
          return log;
        }
      }

      // 2. Timestamp extraction from recording filename
      // Supports:
      // - Standard: "YYYY-MM-DD HH-MM-SS" or "YYYY-MM-DD HH.MM.SS"
      // - WhatsApp: "WhatsApp Video YYYY-MM-DD at HH.MM.SS PM" or "WhatsApp Video YYYY-MM-DD at HH.MM.SS"
      // - Android: "Screen_Recording_YYYYMMDD_HHMMSS" or "Record_YYYYMMDD_HHMMSS"
      let fileHours = -1;
      let fileMinutes = -1;

      // Check WhatsApp Format: "YYYY-MM-DD at HH.MM.SS [AM/PM]"
      const waMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})\s+at\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?\s*(AM|PM)?/i);
      if (waMatch) {
        let hr = parseInt(waMatch[4], 10);
        const min = parseInt(waMatch[5], 10);
        const ampm = (waMatch[7] || '').toUpperCase();
        if (ampm === 'PM' && hr < 12) hr += 12;
        if (ampm === 'AM' && hr === 12) hr = 0;
        fileHours = hr;
        fileMinutes = min;
      }

      // Check Standard & Screen Recorder: "YYYY-MM-DD HH-MM-SS" or "YYYY-MM-DD_HH-MM-SS"
      if (fileHours === -1) {
        const stdMatch = filename.match(/(\d{4})[-_](\d{2})[-_](\d{2})[-_\s]+(\d{2})[-_.:](\d{2})[-_.:](\d{2})/);
        if (stdMatch) {
          fileHours = parseInt(stdMatch[4], 10);
          fileMinutes = parseInt(stdMatch[5], 10);
        }
      }

      // Check Android Compact: "YYYYMMDD_HHMMSS"
      if (fileHours === -1) {
        const compactMatch = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
        if (compactMatch) {
          fileHours = parseInt(compactMatch[4], 10);
          fileMinutes = parseInt(compactMatch[5], 10);
        }
      }

      if (fileHours !== -1 && fileMinutes !== -1) {
        const targetTotalMinutes = fileHours * 60 + fileMinutes;

        let closestLog: WatermarkLog | null = null;
        let minDiffMinutes = Infinity;

        for (const log of allLogs) {
          const logDate = new Date(log.issuedAt);
          // Convert UTC log timestamp to Sri Lanka / local time (UTC + 5:30)
          const totalUtcMinutes = logDate.getUTCHours() * 60 + logDate.getUTCMinutes() + 330;
          const logLocalMinutes = totalUtcMinutes % (24 * 60);

          const diffMinutes = Math.abs(targetTotalMinutes - logLocalMinutes);
          if (diffMinutes < minDiffMinutes) {
            minDiffMinutes = diffMinutes;
            closestLog = log;
          }
        }

        if (closestLog && minDiffMinutes <= 25) {
          this.logger.log(
            `[Forensic Audit] Multi-signal probe matched recording timestamp (${fileHours.toString().padStart(2, '0')}:${fileMinutes.toString().padStart(2, '0')}) to session: ${closestLog.sessionId} (${closestLog.issuedAt.toISOString()})`,
          );
          return closestLog;
        }
      }
    } catch (err: any) {
      this.logger.warn(`probeSessionHint error: ${err.message}`);
    }
    return null;
  }
}

