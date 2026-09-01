import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { KeysService } from './keys.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { DeviceBindingService } from '../../security/device-binding/device-binding.service';
import { AuditService } from '../../security/audit/audit.service';

@Controller('keys')
export class KeysController {
  private readonly logger = new Logger(KeysController.name);
  private readonly allowedOrigins: string[];

  constructor(
    private readonly keysService: KeysService,
    private readonly entitlementService: EntitlementService,
    private readonly configService: ConfigService,
    private readonly deviceBindingService: DeviceBindingService,
    private readonly auditService: AuditService,
  ) {
    this.allowedOrigins = this.configService.get<string[]>('allowedOrigins') || [];
  }

  @Get(':videoId')
  async getKey(
    @Param('videoId') videoId: string,
    @Query('t') token: string,
    @Query('keyIndex') keyIndexStr: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // 1. Validate Origin / Referer against allowlist (defense against unauthorized hotlinking)
    this.validateOriginAndReferer(req);

    // 2. Validate Session Token (short TTL, bound to userId + videoId)
    if (!token) {
      this.logger.warn(`Key request rejected: missing session token for video ${videoId}`);
      throw new UnauthorizedException('Missing session token');
    }

    const payload = this.keysService.verifySessionToken(token);

    // Ensure token is bound to the exact requested videoId
    if (payload.videoId !== videoId) {
      this.logger.warn(
        `Token videoId mismatch: token has ${payload.videoId}, requested ${videoId}`,
      );
      throw new ForbiddenException('Token is not valid for this video');
    }

    // 3. Defense-in-depth: Re-verify user entitlement
    const isEntitled = await this.entitlementService.canWatch(payload.userId, videoId);
    if (!isEntitled) {
      this.logger.warn(
        `Key request rejected: user ${payload.userId} is not entitled to video ${videoId}`,
      );
      throw new ForbiddenException('User is not entitled to access this content');
    }

    // 4. Device Binding & Concurrency Verification
    const incomingFingerprint =
      (req.headers?.['x-device-fingerprint'] as string) ||
      (req.query?.['fp'] as string) ||
      '';
    const clientIp =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip ||
      '127.0.0.1';
    const userAgent = (req.headers?.['user-agent'] as string) || 'Unknown';
    const deviceCoords =
      (req.headers?.['x-device-coords'] as string) ||
      (req.query?.['coords'] as string) ||
      undefined;

    if (payload.sessionId) {
      await this.deviceBindingService.verifyBinding(
        payload.userId,
        payload.sessionId,
        incomingFingerprint,
        clientIp,
        userAgent,
        deviceCoords,
      );
    }

    // 5. Parse key index
    const keyIndex = keyIndexStr ? parseInt(keyIndexStr, 10) : 0;
    if (isNaN(keyIndex) || keyIndex < 0) {
      throw new ForbiddenException('Invalid key index');
    }

    // 6. Fetch raw 16-byte key buffer
    const keyBuffer = await this.keysService.getRawKeyBuffer(videoId, keyIndex);

    // 7. Structured Audit Event (Metadata only, NEVER key bytes)
    this.auditService.logEvent({
      eventType: 'KEY_REQUESTED',
      userId: payload.userId,
      videoId,
      sessionId: payload.sessionId,
      ip: clientIp,
      userAgent,
      deviceFingerprintHash: incomingFingerprint,
      metadata: {
        keyIndex,
        rotationPeriod: payload.sessionId,
      },
    });

    // 8. Send raw 16-byte buffer directly as application/octet-stream
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(keyBuffer);
  }

  private validateOriginAndReferer(req: Request): void {
    if (this.allowedOrigins.length === 0) {
      return; // No origin restrictions configured
    }

    const origin = req.headers['origin'] as string | undefined;
    const referer = req.headers['referer'] as string | undefined;

    const isDomainAllowed = (urlStr: string) => {
      return (
        this.allowedOrigins.some((allowed) => urlStr.startsWith(allowed)) ||
        urlStr.includes('ngrok-free.dev') ||
        urlStr.includes('ngrok-free.app') ||
        urlStr.includes('ngrok.io') ||
        urlStr.includes('localhost')
      );
    };

    if (origin) {
      const isAllowed = isDomainAllowed(origin);
      if (!isAllowed) {
        this.logger.warn(`Key request rejected due to disallowed Origin: ${origin}`);
        throw new ForbiddenException('Disallowed Origin header');
      }
    } else if (referer) {
      const isAllowed = isDomainAllowed(referer);
      if (!isAllowed) {
        this.logger.warn(`Key request rejected due to disallowed Referer: ${referer}`);
        throw new ForbiddenException('Disallowed Referer header');
      }
    }
  }
}
