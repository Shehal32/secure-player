import {
  Controller,
  Post,
  Body,
  Req,
  Headers,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { DeviceBindingService } from '../../security/device-binding/device-binding.service';
import { UserRole } from '../database/entities';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly deviceBindingService: DeviceBindingService,
  ) {}

  /**
   * Student Registration: Generates unique 10-digit SID-[10 digits] and binds device session.
   */
  @Post('register')
  async register(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('deviceFingerprint') bodyFingerprint?: string,
    @Body('coords') bodyCoords?: string,
    @Headers('x-device-fingerprint') headerFingerprint?: string,
    @Headers('x-device-coords') headerCoords?: string,
    @Req() req?: Request,
  ) {
    const authRes = await this.authService.registerStudent({ name, email, password });

    const sessionId = `sess_${Math.random().toString(36).slice(2, 10)}`;
    const deviceFingerprint = bodyFingerprint || headerFingerprint || 'web_default_fp';
    const clientIp =
      (req?.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req?.ip ||
      '127.0.0.1';
    const userAgent = (req?.headers['user-agent'] as string) || 'Unknown Browser';
    const deviceCoords = bodyCoords || headerCoords || (req?.headers['x-device-coords'] as string);

    // Register & Bind device session
    await this.deviceBindingService.registerOrTouchSession({
      userId: authRes.user.id,
      sessionId,
      deviceFingerprint,
      ip: clientIp,
      userAgent,
      deviceCoords,
    });

    return {
      ...authRes,
      sessionId,
    };
  }

  /**
   * Login for Students and Administrators.
   */
  @Post('login')
  async login(
    @Body('identifier') identifier: string,
    @Body('password') password: string,
    @Body('requiredRole') requiredRole?: UserRole,
    @Body('deviceFingerprint') bodyFingerprint?: string,
    @Body('coords') bodyCoords?: string,
    @Headers('x-device-fingerprint') headerFingerprint?: string,
    @Headers('x-device-coords') headerCoords?: string,
    @Req() req?: Request,
  ) {
    const authRes = await this.authService.login({
      identifier,
      password,
      requiredRole,
    });

    const sessionId = `sess_${Math.random().toString(36).slice(2, 10)}`;
    const deviceFingerprint = bodyFingerprint || headerFingerprint || 'web_default_fp';
    const clientIp =
      (req?.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req?.ip ||
      '127.0.0.1';
    const userAgent = (req?.headers['user-agent'] as string) || 'Unknown Browser';
    const deviceCoords = bodyCoords || headerCoords || (req?.headers['x-device-coords'] as string);

    // Register & Bind device session
    await this.deviceBindingService.registerOrTouchSession({
      userId: authRes.user.id,
      sessionId,
      deviceFingerprint,
      ip: clientIp,
      userAgent,
      deviceCoords,
    });

    return {
      ...authRes,
      sessionId,
    };
  }

  /**
   * Request / Refresh Playback Stream Token with Device Session verification.
   */
  @Post('token')
  async createToken(
    @Body('userId') userId: string,
    @Body('email') rawEmail?: string,
    @Body('videoId') videoId?: string,
    @Body('sessionId') clientSessionId?: string,
    @Body('deviceFingerprint') bodyFingerprint?: string,
    @Body('coords') bodyCoords?: string,
    @Headers('x-device-fingerprint') headerFingerprint?: string,
    @Headers('x-device-coords') headerCoords?: string,
    @Req() req?: Request,
  ) {
    const email = rawEmail || `${userId}@example.com`;
    const sessionId = clientSessionId || `sess_${Math.random().toString(36).slice(2, 10)}`;
    const deviceFingerprint = bodyFingerprint || headerFingerprint || 'web_default_fp';

    const clientIp =
      (req?.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req?.ip ||
      '127.0.0.1';
    const userAgent = (req?.headers['user-agent'] as string) || 'Unknown Client';
    const deviceCoords = bodyCoords || headerCoords || (req?.headers['x-device-coords'] as string);

    if (videoId) {
      await this.authService.grantEntitlement(userId, videoId, email);
    }

    // Touch device session & enforce concurrent limit
    await this.deviceBindingService.registerOrTouchSession({
      userId,
      sessionId,
      deviceFingerprint,
      ip: clientIp,
      userAgent,
      deviceCoords,
    });

    const token = this.authService.generateUserJwt(userId, email);
    return { token, userId, email, videoId, sessionId };
  }
}
