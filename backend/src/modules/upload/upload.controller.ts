import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

  @Get('videos')
  async listVideos() {
    const videos = await this.uploadService.getAllVideos();
    return {
      count: videos.length,
      videos: videos.map((v) => ({
        id: v.id,
        title: v.title,
        blobPrefix: v.blobPrefix,
        sourceType: v.blobPrefix?.startsWith('youtube:') ? 'youtube' : 'hls',
        youtubeId: v.blobPrefix?.startsWith('youtube:') ? v.blobPrefix.replace('youtube:', '') : undefined,
        keyCount: v.keys ? v.keys.length : 0,
        createdAt: v.createdAt,
      })),
    };
  }

  @Post('youtube')
  async addYouTubeVideo(
    @Body('youtubeUrl') youtubeUrl: string,
    @Body('title') title?: string,
    @Body('videoId') customVideoId?: string,
  ) {
    if (!youtubeUrl) {
      throw new BadRequestException('Missing required field: youtubeUrl');
    }
    return await this.uploadService.addYouTubeVideo(youtubeUrl, title, customVideoId);
  }

  @Delete('videos/:videoId')
  async deleteVideo(@Param('videoId') videoId: string) {
    if (!videoId) {
      throw new BadRequestException('Missing videoId parameter');
    }
    this.logger.log(`Received request to delete video "${videoId}"`);
    return await this.uploadService.deleteVideo(videoId);
  }

  @Post('video')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAndEncode(
    @UploadedFile() file: Express.Multer.File,
    @Body('videoId') videoId: string,
    @Body('title') title?: string,
    @Body('userId') userId = 'demo_user_1',
    @Body('keyRotation') keyRotationStr = '0',
    @Body('segmentDuration') segmentDurationStr = '6',
  ) {
    if (!file) {
      throw new BadRequestException('No video file provided');
    }
    if (!videoId) {
      throw new BadRequestException('Missing required field: videoId');
    }

    const keyRotationSegments = parseInt(keyRotationStr, 10) || 0;
    const segmentDuration = parseFloat(segmentDurationStr) || 6;

    this.logger.log(`Received upload for videoId="${videoId}", file="${file.originalname}", size=${file.size} bytes`);

    const result = await this.uploadService.processAndEncodeVideo({
      videoId,
      title: title || `Video ${videoId}`,
      userId,
      keyRotationSegments,
      segmentDuration,
      fileBuffer: file.buffer,
      originalFilename: file.originalname,
    });

    return {
      message: 'Video successfully encoded and uploaded',
      ...result,
    };
  }
}
