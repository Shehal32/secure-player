import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { DeviceBindingService } from './device-binding.service';
import { GeoAnomalyService } from '../geo-anomaly/geo-anomaly.service';

@Controller('account')
export class AccountSessionsController {
  constructor(
    private readonly deviceBindingService: DeviceBindingService,
    private readonly geoAnomalyService: GeoAnomalyService,
  ) {}

  /**
   * List all device sessions for a user (allowing students and admins to manage their devices).
   */
  @Get('sessions')
  async listSessions(
    @Query('userId') userId: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const targetUserId = userId || headerUserId;
    if (!targetUserId) {
      throw new BadRequestException('Missing userId query parameter or x-user-id header');
    }

    const sessions = await this.deviceBindingService.getUserSessions(targetUserId);

    return {
      userId: targetUserId,
      activeCount: sessions.filter((s) => !s.isRevoked).length,
      sessions: sessions.map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        deviceFingerprint: s.deviceFingerprint.slice(0, 12) + '...',
        ip: s.ip,
        userAgent: s.userAgent,
        location: s.location,
        isRevoked: s.isRevoked,
        revokedReason: s.revokedReason,
        issuedAt: s.issuedAt,
        lastSeenAt: s.lastSeenAt,
      })),
    };
  }

  /**
   * Revoke an active device session.
   */
  @Delete('sessions/:sessionId')
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @Query('userId') userId: string,
    @Headers('x-user-id') headerUserId?: string,
  ) {
    const targetUserId = userId || headerUserId || 'unknown';
    const success = await this.deviceBindingService.revokeSession(
      targetUserId,
      sessionId,
      'USER_REVOKED',
    );

    return {
      success,
      sessionId,
      message: success ? 'Device session successfully revoked.' : 'Session not found.',
    };
  }

  /**
   * List recent impossible travel anomalies for the Admin Dashboard.
   */
  @Get('anomalies')
  async listAnomalies() {
    const anomalies = await this.geoAnomalyService.getRecentAnomalies(50);
    return {
      count: anomalies.length,
      anomalies,
    };
  }
}
