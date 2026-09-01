import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSession } from '../../modules/database/entities';
import { AuditService } from '../audit/audit.service';

export interface ConcurrencyCheckResult {
  allowed: boolean;
  evictedSessionId?: string;
  activeCount: number;
}

@Injectable()
export class SessionLimitService {
  private readonly logger = new Logger(SessionLimitService.name);

  constructor(
    @InjectRepository(DeviceSession)
    private readonly deviceSessionRepository: Repository<DeviceSession>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Enforces max concurrent active device sessions per user.
   * If the limit is exceeded by a incoming session, evicts the oldest active session.
   * @param userId The user ID
   * @param newSessionId The current/incoming session ID
   * @param maxConcurrent Maximum allowed concurrent active devices (default 2)
   */
  async enforceLimit(
    userId: string,
    newSessionId: string,
    maxConcurrent = 2,
  ): Promise<ConcurrencyCheckResult> {
    // 1. Fetch all currently active (non-revoked) sessions for the user, ordered by oldest first
    const activeSessions = await this.deviceSessionRepository.find({
      where: { userId, isRevoked: false },
      order: { issuedAt: 'ASC' },
    });

    // Check if the current session is already among the active sessions
    const isExisting = activeSessions.some((s) => s.sessionId === newSessionId);
    const totalCount = isExisting ? activeSessions.length : activeSessions.length + 1;

    if (totalCount <= maxConcurrent) {
      return {
        allowed: true,
        activeCount: totalCount,
      };
    }

    // Exceeded limit: Calculate how many excess sessions need eviction
    const excessCount = totalCount - maxConcurrent;
    let evictedSessionId: string | undefined;

    // Evict oldest sessions that are NOT the new session
    const candidatesToEvict = activeSessions.filter((s) => s.sessionId !== newSessionId);

    for (let i = 0; i < Math.min(excessCount, candidatesToEvict.length); i++) {
      const sessionToEvict = candidatesToEvict[i];
      sessionToEvict.isRevoked = true;
      sessionToEvict.revokedReason = 'EVICTED_CONCURRENCY_LIMIT';
      await this.deviceSessionRepository.save(sessionToEvict);

      evictedSessionId = sessionToEvict.sessionId;

      this.logger.warn(
        `[CONCURRENCY LIMIT] Evicted oldest active session "${sessionToEvict.sessionId}" for user="${userId}" due to max limit (${maxConcurrent}) reached by incoming session="${newSessionId}"`,
      );

      // Structured audit event
      await this.auditService.logEvent({
        eventType: 'SESSION_EVICTED',
        userId,
        sessionId: sessionToEvict.sessionId,
        ip: sessionToEvict.ip,
        userAgent: sessionToEvict.userAgent,
        deviceFingerprintHash: sessionToEvict.deviceFingerprint,
        metadata: {
          reason: 'EVICTED_CONCURRENCY_LIMIT',
          maxConcurrent,
          replacedBySession: newSessionId,
        },
      });
    }

    return {
      allowed: true,
      evictedSessionId,
      activeCount: maxConcurrent,
    };
  }
}
