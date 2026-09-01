import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  ForbiddenException,
  NotFoundException,
  Logger,
  Query,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { BlobService } from '../blob/blob.service';
import { PlaylistService } from './playlist.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { WatermarkService } from '../watermark/watermark.service';
import { KeysService } from '../keys/keys.service';
import { DeviceBindingService } from '../../security/device-binding/device-binding.service';
import { AuditService } from '../../security/audit/audit.service';

@Controller('playlist')
export class PlaylistController {
  private readonly logger = new Logger(PlaylistController.name);

  constructor(
    private readonly blobService: BlobService,
    private readonly playlistService: PlaylistService,
    private readonly entitlementService: EntitlementService,
    private readonly watermarkService: WatermarkService,
    private readonly jwtService: JwtService,
    private readonly keysService: KeysService,
    private readonly deviceBindingService: DeviceBindingService,
    private readonly auditService: AuditService,
  ) {}

  @Get(':videoId')
  async getPlaylist(
    @Param('videoId') videoId: string,
    @Query('jwt') jwtQuery: string,
    @Query('sessionId') sessionQuery: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // 1. Authenticate user via Bearer token in header or ?jwt= query param
    const authResult = this.extractAuthFromRequest(req, jwtQuery);
    if (!authResult) {
      this.logger.warn(`Unauthenticated request for playlist of video ${videoId}`);
      throw new ForbiddenException('Authentication required');
    }

    const { userId, jwtPayload } = authResult;

    // 2. Verify user entitlement (fail closed)
    const isEntitled = await this.entitlementService.canWatch(userId, videoId);
    if (!isEntitled) {
      this.logger.warn(`User ${userId} not entitled to watch video ${videoId}`);
      throw new ForbiddenException('User is not entitled to watch this video');
    }

    // 3. Determine Session ID & Verify Device Binding
    const sessionId =
      sessionQuery ||
      jwtPayload.sessionId ||
      `sess_${userId}_${Math.floor(Date.now() / (1000 * 3600))}`;

    const incomingFingerprint =
      (req.headers['x-device-fingerprint'] as string) ||
      (req.query['fp'] as string) ||
      '';
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip ||
      '127.0.0.1';
    const userAgent = (req.headers['user-agent'] as string) || 'Unknown';

    await this.deviceBindingService.verifyBinding(
      userId,
      sessionId,
      incomingFingerprint,
      clientIp,
      userAgent,
    );

    // 4. Fetch raw M3U8 manifest from Azure Blob Storage (master.m3u8 if available, otherwise index.m3u8 or specific variant)
    const variantQuery = (req.query['variant'] || req.query['level']) as string;
    const isMasterRequest = !variantQuery;
    let rawM3u8: string;
    try {
      if (isMasterRequest) {
        try {
          rawM3u8 = await this.blobService.downloadBlob(`videos/${videoId}/master.m3u8`);
        } catch {
          rawM3u8 = await this.blobService.downloadBlob(`videos/${videoId}/index.m3u8`);
        }
      } else {
        try {
          rawM3u8 = await this.blobService.downloadBlob(`videos/${videoId}/${variantQuery}.m3u8`);
        } catch {
          rawM3u8 = await this.blobService.downloadBlob(`videos/${videoId}/index.m3u8`);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to download manifest for video ${videoId}`, err);
      throw new NotFoundException(`Playlist not found for video ${videoId}`);
    }

    // 5. Count media segments & Generate Forensic A/B Watermark Pattern
    const segmentLines = rawM3u8.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    const segmentCount = segmentLines.length;

    let sessionPattern = '';
    try {
      sessionPattern = await this.watermarkService.getOrCreateSessionPattern(
        userId,
        videoId,
        sessionId,
        segmentCount,
      );
    } catch (err) {
      this.logger.warn(`Failed to generate watermark session pattern for user ${userId}`, err);
    }

    // 6. Rewrite playlist with short-lived key session token, direct batched Azure SAS URLs, and A/B forensic selection
    const rawJwt = this.extractRawToken(req, jwtQuery);
    const prefixHeader = (req.headers['x-forwarded-prefix'] as string) || '';
    const originalUrl = req.originalUrl || req.url || '';
    const hostHeader = (req.headers['host'] as string) || '';
    const isHostedDomain =
      hostHeader.includes('cloudapp.azure.com') ||
      hostHeader.includes('fonixedu.com') ||
      hostHeader.includes('eduone.com');

    const basePath = prefixHeader
      ? prefixHeader.replace(/\/+$/, '')
      : originalUrl.includes('/secure-api') || isHostedDomain
        ? '/secure-api'
        : '';

    const rewrittenM3u8 = this.playlistService.rewritePlaylist(
      rawM3u8,
      videoId,
      userId,
      sessionPattern,
      sessionId,
      rawJwt,
      basePath,
    );

    // 7. Send response with strict no-cache headers
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(rewrittenM3u8);
  }

  private extractRawToken(req: Request, jwtQuery?: string): string | undefined {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return jwtQuery;
  }

  private extractAuthFromRequest(
    req: Request,
    jwtQuery?: string,
  ): { userId: string; jwtPayload: Record<string, any> } | null {
    const token = this.extractRawToken(req, jwtQuery);
    if (!token) {
      return null;
    }

    try {
      const decoded = this.jwtService.verify(token);
      const userId = decoded.sub || decoded.userId || decoded.id || null;
      if (userId) {
        return { userId, jwtPayload: decoded };
      }
    } catch {
      // If standard JWT failed, check if it is a signed KeysService session token
      try {
        const keyPayload = this.keysService.verifySessionToken(token);
        if (keyPayload && keyPayload.userId) {
          return { userId: keyPayload.userId, jwtPayload: keyPayload };
        }
      } catch (err) {
        this.logger.warn('JWT and session token verification failed in playlist route', err);
      }
    }
    return null;
  }
}
