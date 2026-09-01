import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WatermarkService, LeakerIdentificationResult } from './watermark.service';

@Controller('watermark')
export class WatermarkController {
  constructor(private readonly watermarkService: WatermarkService) {}

  @Get('logs')
  async listLogs() {
    const logs = await this.watermarkService.getRecentLogs(50);
    return {
      count: logs.length,
      logs: logs.map((l) => ({
        id: l.id,
        userId: l.userId,
        videoId: l.videoId,
        sessionId: l.sessionId,
        pattern: l.pattern,
        segmentCount: l.segmentCount,
        issuedAt: l.issuedAt,
      })),
    };
  }

  @Post('identify')
  async identifyLeaker(
    @Body('videoId') videoId: string,
    @Body('pattern') extractedPattern: string,
    @Body('maxErrorRate') maxErrorRateStr?: string,
  ): Promise<LeakerIdentificationResult | { matchFound: false; message: string }> {
    if (!extractedPattern) {
      throw new BadRequestException('Missing extractedPattern in request body');
    }

    const maxErrorRate = maxErrorRateStr ? parseFloat(maxErrorRateStr) : 0.2;
    const result = await this.watermarkService.identifyLeaker(videoId, extractedPattern, maxErrorRate);

    if (!result) {
      return {
        matchFound: false,
        message: 'No session pattern matched the extracted watermark within the tolerance threshold.',
      };
    }

    return result;
  }

  /**
   * Accepts a recorded video (.mp4, .mov, .webm) or static screenshot (.png, .jpg, .webp),
   * extracts the forensic watermark pattern via crop-resilient FFmpeg frame probing,
   * and runs automated leak identification against PostgreSQL audit logs.
   */
  @Post('analyze-video')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  async analyzeRecordedVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body('videoId') videoId: string,
    @Body('maxErrorRate') maxErrorRateStr?: string,
  ): Promise<LeakerIdentificationResult | { matchFound: false; extractedPattern: string; message: string }> {
    if (!file) {
      throw new BadRequestException('No video or screenshot file uploaded');
    }

    const tempFilePath = path.join(os.tmpdir(), `forensic_${Date.now()}_${file.originalname}`);
    fs.writeFileSync(tempFilePath, file.buffer);

    try {
      const ext = path.extname(file.originalname).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext);

      // 1. Extract pattern (single screenshot or video sequence)
      let extractedPattern = '';
      if (isImage) {
        extractedPattern = await this.watermarkService.extractPatternFromImage(tempFilePath);
      } else {
        extractedPattern = await this.watermarkService.extractPatternFromVideo(tempFilePath, 6);
      }

      // 2. Identify matching session in PostgreSQL using multi-signal pattern + session hint
      const maxErrorRate = maxErrorRateStr ? parseFloat(maxErrorRateStr) : 0.25;
      const sessionHint = await this.watermarkService.probeSessionHint(tempFilePath, videoId);
      const result = await this.watermarkService.identifyLeaker(videoId, extractedPattern, maxErrorRate, sessionHint);

      if (!result) {
        return {
          matchFound: false,
          extractedPattern,
          message: 'Watermark pattern was extracted, but no registered session matched within the tolerance threshold.',
        };
      }

      return {
        ...result,
        extractedPattern,
      };
    } finally {
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          // Ignore
        }
      }
    }
  }
}
