import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { VideoKey } from '../database/entities';

export interface KeySessionPayload {
  userId: string;
  videoId: string;
  sessionId?: string;
  exp: number;
  nonce: string;
}

@Injectable()
export class KeysService {
  private readonly logger = new Logger(KeysService.name);
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(
    @InjectRepository(VideoKey)
    private readonly videoKeyRepository: Repository<VideoKey>,
    private readonly configService: ConfigService,
  ) {
    this.secret = this.configService.get<string>('keySessionSecret') || 'dev_insecure_key_session_hmac_secret_32b';
    this.ttlSeconds = this.configService.get<number>('keySessionTtlSeconds') || 60;
  }

  /**
   * Generates a signed, tamper-proof, short-lived session token bound to a user, video, and session.
   */
  generateSessionToken(
    userId: string,
    videoId: string,
    customTtlSeconds?: number,
    sessionId?: string,
  ): string {
    const ttl = customTtlSeconds || this.ttlSeconds;
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const nonce = crypto.randomBytes(8).toString('hex');

    const payload: KeySessionPayload = {
      userId,
      videoId,
      sessionId,
      exp,
      nonce,
    };

    const payloadJson = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(payloadBase64)
      .digest('base64url');

    return `${payloadBase64}.${signature}`;
  }

  /**
   * Validates a session token and ensures it has not expired and matches signature.
   */
  verifySessionToken(token: string): KeySessionPayload {
    if (!token || !token.includes('.')) {
      throw new UnauthorizedException('Missing or malformed session token');
    }

    const [payloadBase64, signature] = token.split('.');
    if (!payloadBase64 || !signature) {
      throw new UnauthorizedException('Malformed session token structure');
    }

    // Verify HMAC-SHA256 signature in constant time
    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(payloadBase64)
      .digest('base64url');

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      this.logger.warn('Key request rejected: HMAC signature verification failed');
      throw new UnauthorizedException('Invalid or tampered session token');
    }

    // Parse and check expiration
    let payload: KeySessionPayload;
    try {
      const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
      payload = JSON.parse(payloadJson);
    } catch {
      throw new UnauthorizedException('Failed to parse token payload');
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      this.logger.warn(`Key request rejected: session token expired (expired at ${payload.exp}, now is ${now})`);
      throw new UnauthorizedException('Session token has expired');
    }

    return payload;
  }

  /**
   * Fetches raw 16-byte key buffer from database.
   */
  async getRawKeyBuffer(videoId: string, keyIndex: number): Promise<Buffer> {
    const videoKey = await this.videoKeyRepository.findOne({
      where: { videoId, keyIndex },
    });

    if (!videoKey) {
      this.logger.error(`Key not found for video=${videoId}, keyIndex=${keyIndex}`);
      throw new NotFoundException(`Key index ${keyIndex} not found for video ${videoId}`);
    }

    return Buffer.from(videoKey.keyHex, 'hex');
  }
}
