import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SecurityAuditLog, SecurityAuditEventType } from '../../modules/database/entities';

export interface AuditEventPayload {
  eventType: SecurityAuditEventType;
  userId: string;
  videoId?: string | null;
  sessionId?: string | null;
  ip?: string;
  userAgent?: string;
  deviceFingerprintHash?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(SecurityAuditLog)
    private readonly auditRepository: Repository<SecurityAuditLog>,
  ) {}

  /**
   * Non-blocking async fire-and-forget audit event logger.
   * Ensures zero added latency to the video playback hot path.
   */
  async logEvent(payload: AuditEventPayload): Promise<void> {
    try {
      const record = this.auditRepository.create({
        eventType: payload.eventType,
        userId: payload.userId,
        videoId: payload.videoId || null,
        sessionId: payload.sessionId || null,
        ip: payload.ip || '127.0.0.1',
        userAgent: payload.userAgent || 'Unknown',
        deviceFingerprintHash: payload.deviceFingerprintHash || 'None',
        metadata: payload.metadata || null,
      });

      // Fire and log
      await this.auditRepository.save(record);
      this.logger.log(
        `[SECURITY AUDIT] ${payload.eventType}: user=${payload.userId}, session=${payload.sessionId || 'N/A'}, video=${payload.videoId || 'N/A'}, ip=${payload.ip || 'N/A'}`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to write security audit log: ${err.message}`);
    }
  }

  /**
   * Queries audit records by user ID or video ID for forensic investigations.
   */
  async getAuditTrail(filter: {
    userId?: string;
    videoId?: string;
    sessionId?: string;
    eventType?: SecurityAuditEventType;
    limit?: number;
  }): Promise<SecurityAuditLog[]> {
    const where: any = {};
    if (filter.userId) where.userId = filter.userId;
    if (filter.videoId) where.videoId = filter.videoId;
    if (filter.sessionId) where.sessionId = filter.sessionId;
    if (filter.eventType) where.eventType = filter.eventType;

    return await this.auditRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: filter.limit || 100,
    });
  }
}
