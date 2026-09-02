import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { BlobServiceClient } from '@azure/storage-blob';
import { Video, VideoKey, Purchase, WatermarkLog } from '../database/entities';
import { AuthService } from '../auth/auth.service';

export interface UploadOptions {
  videoId: string;
  title?: string;
  userId?: string;
  keyRotationSegments?: number;
  segmentDuration?: number;
  fileBuffer: Buffer;
  originalFilename: string;
}

export interface UploadResult {
  videoId: string;
  title: string;
  segmentCount: number;
  keyCount: number;
  uploadedToAzure: boolean;
  savedToDatabase: boolean;
  duration?: number;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly ffmpegPath: string;

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    @InjectRepository(VideoKey)
    private readonly videoKeyRepository: Repository<VideoKey>,
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    @InjectRepository(WatermarkLog)
    private readonly watermarkLogRepository: Repository<WatermarkLog>,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
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
   * Encodes an uploaded video into encrypted AES-128 HLS with dual A/B forensic variants,
   * uploads to Azure Blob Storage, stores keys in DB, and grants entitlement to the user.
   */
  async processAndEncodeVideo(options: UploadOptions): Promise<UploadResult> {
    const {
      videoId,
      title = `Video ${videoId}`,
      userId,
      keyRotationSegments = 0,
      segmentDuration = 6,
      fileBuffer,
      originalFilename,
    } = options;

    const tempDir = path.join(os.tmpdir(), 'secure_player_uploads', videoId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const inputExt = path.extname(originalFilename) || '.mp4';
    const inputFilePath = path.join(tempDir, `input_${videoId}${inputExt}`);
    fs.writeFileSync(inputFilePath, fileBuffer);

    const outputHlsDir = path.join(tempDir, 'hls_out');
    if (!fs.existsSync(outputHlsDir)) {
      fs.mkdirSync(outputHlsDir, { recursive: true });
    }

    this.logger.log(`Starting HLS AES-128 A/B packaging for videoId=${videoId} using FFmpeg=${this.ffmpegPath}`);

    const keys: Array<{
      keyIndex: number;
      keyPeriod: number;
      keyHex: string;
      ivHex: string;
      keyBuffer: Buffer;
    }> = [];

    try {
      const PROFILES = [
        { name: '1080p', label: '1080p Full HD', height: 1080, vBitrate: '2800k', bandwidth: 3200000 },
        { name: '720p', label: '720p HD', height: 720, vBitrate: '1400k', bandwidth: 1600000 },
        { name: '480p', label: '480p SD', height: 480, vBitrate: '750k', bandwidth: 850000 },
        { name: '360p', label: '360p Low', height: 360, vBitrate: '400k', bandwidth: 450000 },
        { name: '240p', label: '240p Data Saver', height: 240, vBitrate: '220k', bandwidth: 250000 },
      ];

      const masterLines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3'];
      let primarySegmentCount = 0;

      for (let pIdx = 0; pIdx < PROFILES.length; pIdx++) {
        const prof = PROFILES[pIdx];
        const profDirA = path.join(tempDir, `raw_${prof.name}_a`);
        const profDirB = path.join(tempDir, `raw_${prof.name}_b`);
        fs.mkdirSync(profDirA, { recursive: true });
        fs.mkdirSync(profDirB, { recursive: true });

        const rawPlaylistA = path.join(profDirA, 'raw.m3u8');
        const rawPatternA = path.join(profDirA, 'raw_%03d.ts');
        const rawPlaylistB = path.join(profDirB, 'raw.m3u8');
        const rawPatternB = path.join(profDirB, 'raw_%03d.ts');

        const scaleFilter = `scale=-2:${prof.height}`;

        // 1. Encode Variant A for this resolution profile
        await this.runFfmpeg([
          '-y',
          '-i', inputFilePath,
          '-vf', scaleFilter,
          '-c:v', 'libx264',
          '-profile:v', 'main',
          '-pix_fmt', 'yuv420p',
          '-b:v', prof.vBitrate,
          '-preset', 'veryfast',
          '-g', '60',
          '-keyint_min', '60',
          '-sc_threshold', '0',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-hls_time', segmentDuration.toString(),
          '-hls_list_size', '0',
          '-hls_segment_filename', rawPatternA,
          '-hls_playlist_type', 'vod',
          rawPlaylistA,
        ]);

        // 2. Encode Variant B for this resolution profile
        const cropImmuneFilter = [
          scaleFilter,
          'eq=contrast=1.015:brightness=0.008',
          'drawbox=x=16:y=16:w=14:h=14:color=white@0.08:t=fill',
          'drawbox=x=w-30:y=16:w=14:h=14:color=white@0.08:t=fill',
          'drawbox=x=w/2-7:y=h/2-7:w=14:h=14:color=white@0.08:t=fill',
          'drawbox=x=16:y=h-30:w=14:h=14:color=white@0.08:t=fill',
          'drawbox=x=w-30:y=h-30:w=14:h=14:color=white@0.08:t=fill',
        ].join(',');

        await this.runFfmpeg([
          '-y',
          '-i', inputFilePath,
          '-vf', cropImmuneFilter,
          '-c:v', 'libx264',
          '-profile:v', 'main',
          '-pix_fmt', 'yuv420p',
          '-b:v', prof.vBitrate,
          '-preset', 'veryfast',
          '-g', '60',
          '-keyint_min', '60',
          '-sc_threshold', '0',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-hls_time', segmentDuration.toString(),
          '-hls_list_size', '0',
          '-hls_segment_filename', rawPatternB,
          '-hls_playlist_type', 'vod',
          rawPlaylistB,
        ]);

        const rawSegsA = fs
          .readdirSync(profDirA)
          .filter((f) => f.startsWith('raw_') && f.endsWith('.ts'))
          .sort();
        const rawSegsB = fs
          .readdirSync(profDirB)
          .filter((f) => f.startsWith('raw_') && f.endsWith('.ts'))
          .sort();

        if (pIdx === 0) {
          primarySegmentCount = rawSegsA.length;
        }

        const rotationInterval = keyRotationSegments > 0 ? keyRotationSegments : rawSegsA.length + 10;

        const profPlaylistLines: string[] = [
          '#EXTM3U',
          '#EXT-X-VERSION:3',
          `#EXT-X-TARGETDURATION:${segmentDuration + 2}`,
          '#EXT-X-MEDIA-SEQUENCE:0',
          '#EXT-X-PLAYLIST-TYPE:VOD',
        ];

        for (let i = 0; i < rawSegsA.length; i++) {
          const keyIndex = Math.floor(i / rotationInterval);
          const isNewKeyPeriod = i % rotationInterval === 0;

          // Generate or reuse key for this keyIndex
          if (pIdx === 0 && isNewKeyPeriod) {
            const keyBuffer = crypto.randomBytes(16);
            const ivBuffer = crypto.randomBytes(16);
            const keyHex = keyBuffer.toString('hex');
            const ivHex = ivBuffer.toString('hex');

            keys.push({
              keyIndex,
              keyPeriod: keyIndex * rotationInterval,
              keyHex,
              ivHex,
              keyBuffer,
            });
          }

          const currentKey = keys[keyIndex] || keys[0];
          if (isNewKeyPeriod) {
            const keyUri =
              keyIndex === 0 && keyRotationSegments <= 0
                ? `/keys/${videoId}`
                : `/keys/${videoId}?keyIndex=${keyIndex}`;

            profPlaylistLines.push(
              `#EXT-X-KEY:METHOD=AES-128,URI="${keyUri}",IV=0x${currentKey.ivHex}`,
            );
          }

          const segIndexStr = String(i).padStart(3, '0');
          const segNameA = `segment_${prof.name}_${segIndexStr}_a.ts`;
          const segNameB = `segment_${prof.name}_${segIndexStr}_b.ts`;
          const segNameDefault = `segment_${prof.name}_${segIndexStr}.ts`;

          // Encrypt Variant A
          const rawBytesA = fs.readFileSync(path.join(profDirA, rawSegsA[i]));
          const cipherA = crypto.createCipheriv(
            'aes-128-cbc',
            currentKey.keyBuffer,
            Buffer.from(currentKey.ivHex, 'hex'),
          );
          const encBytesA = Buffer.concat([cipherA.update(rawBytesA), cipherA.final()]);
          fs.writeFileSync(path.join(outputHlsDir, segNameA), encBytesA);
          fs.writeFileSync(path.join(outputHlsDir, segNameDefault), encBytesA);

          // Encrypt Variant B
          if (i < rawSegsB.length) {
            const rawBytesB = fs.readFileSync(path.join(profDirB, rawSegsB[i]));
            const cipherB = crypto.createCipheriv(
              'aes-128-cbc',
              currentKey.keyBuffer,
              Buffer.from(currentKey.ivHex, 'hex'),
            );
            const encBytesB = Buffer.concat([cipherB.update(rawBytesB), cipherB.final()]);
            fs.writeFileSync(path.join(outputHlsDir, segNameB), encBytesB);
          } else {
            fs.writeFileSync(path.join(outputHlsDir, segNameB), encBytesA);
          }

          profPlaylistLines.push(`#EXTINF:${segmentDuration.toFixed(6)},`);
          profPlaylistLines.push(segNameA);
        }

        profPlaylistLines.push('#EXT-X-ENDLIST');
        const profPlaylistContent = profPlaylistLines.join('\n');
        fs.writeFileSync(path.join(outputHlsDir, `${prof.name}.m3u8`), profPlaylistContent, 'utf8');

        if (pIdx === 0) {
          fs.writeFileSync(path.join(outputHlsDir, 'index.m3u8'), profPlaylistContent, 'utf8');
        }

        masterLines.push(
          `#EXT-X-STREAM-INF:BANDWIDTH=${prof.bandwidth},RESOLUTION=${Math.round((prof.height * 16) / 9)}x${prof.height},NAME="${prof.label}"`,
        );
        masterLines.push(`${prof.name}.m3u8`);
      }

      fs.writeFileSync(path.join(outputHlsDir, 'master.m3u8'), masterLines.join('\n'), 'utf8');

      // 3. Upload HLS assets (playlists, Variant A, Variant B) to Azure Blob Storage
      let uploadedToAzure = false;
      const azureConn = this.configService.get<string>('azureStorageConnectionString');
      const containerName = this.configService.get<string>('azureStorageContainerName') || 'videos';

      if (azureConn) {
        uploadedToAzure = await this.uploadToAzureBlob(outputHlsDir, videoId, azureConn, containerName);
      }

      // 4. Persist Video & Keys in PostgreSQL via TypeORM
      await this.saveToDatabase(videoId, title, keys);

      // 5. Auto-grant entitlement if userId provided
      if (userId) {
        await this.authService.grantEntitlement(userId, videoId);
      }

      const totalSegments = primarySegmentCount;

      return {
        videoId,
        title,
        segmentCount: totalSegments,
        keyCount: keys.length,
        uploadedToAzure,
        savedToDatabase: true,
      };
    } finally {
      // Clean up temporary files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        this.logger.warn(`Failed to clean up temp dir: ${tempDir}`, err);
      }
    }
  }

  private async uploadToAzureBlob(
    outputDir: string,
    videoId: string,
    connectionString: string,
    containerName: string,
  ): Promise<boolean> {
    try {
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      await containerClient.createIfNotExists({ access: undefined });

      const files = fs.readdirSync(outputDir);
      for (const file of files) {
        if (file.endsWith('.m3u8') || file.endsWith('.ts')) {
          const filePath = path.join(outputDir, file);
          const blobPath = `videos/${videoId}/${file}`;
          const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
          const data = fs.readFileSync(filePath);

          await blockBlobClient.uploadData(data, {
            blobHTTPHeaders: {
              blobContentType: file.endsWith('.m3u8')
                ? 'application/vnd.apple.mpegurl'
                : 'video/mp2t',
              blobCacheControl: file.endsWith('.m3u8')
                ? 'no-cache'
                : 'public, max-age=31536000',
            },
          });
        }
      }
      this.logger.log(`Uploaded all HLS assets & A/B variants for video ${videoId} to Azure container "${containerName}"`);
      return true;
    } catch (err) {
      this.logger.error(`Azure Blob upload failed for video ${videoId}`, err);
      return false;
    }
  }

  private async saveToDatabase(
    videoId: string,
    title: string,
    keys: Array<{ keyIndex: number; keyPeriod: number; keyHex: string; ivHex: string }>,
  ): Promise<void> {
    let video = await this.videoRepository.findOne({ where: { id: videoId } });
    if (!video) {
      video = this.videoRepository.create({
        id: videoId,
        title,
        blobPrefix: `videos/${videoId}/`,
      });
      await this.videoRepository.save(video);
    } else {
      video.title = title;
      await this.videoRepository.save(video);
    }

    for (const key of keys) {
      let videoKey = await this.videoKeyRepository.findOne({
        where: { videoId, keyIndex: key.keyIndex },
      });

      if (!videoKey) {
        videoKey = this.videoKeyRepository.create({
          videoId,
          keyIndex: key.keyIndex,
          keyPeriod: key.keyPeriod,
          keyHex: key.keyHex,
          ivHex: key.ivHex,
        });
      } else {
        videoKey.keyHex = key.keyHex;
        videoKey.ivHex = key.ivHex;
        videoKey.keyPeriod = key.keyPeriod;
      }
      await this.videoKeyRepository.save(videoKey);
    }
  }

  async getAllVideos(): Promise<Video[]> {
    return await this.videoRepository.find({
      order: { createdAt: 'DESC' },
      relations: ['keys'],
    });
  }

  /**
   * Adds a YouTube protected lecture to the database and grants access to students.
   */
  async addYouTubeVideo(youtubeUrl: string, title?: string, customVideoId?: string): Promise<Video> {
    const trimmed = (youtubeUrl || '').trim();
    let ytId: string | null = null;
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      ytId = trimmed;
    } else {
      const match = trimmed.match(
        /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/,
      );
      if (match) {
        ytId = match[1];
      }
    }

    if (!ytId) {
      throw new BadRequestException('Invalid YouTube URL or 11-character Video ID');
    }

    const videoId = customVideoId && customVideoId.trim() ? customVideoId.trim() : `yt_${ytId}`;
    const videoTitle = title && title.trim() ? title.trim() : `YouTube Lecture (${ytId})`;

    // Check if video already exists
    let video = await this.videoRepository.findOne({ where: { id: videoId } });
    if (!video) {
      video = this.videoRepository.create({
        id: videoId,
        title: videoTitle,
        blobPrefix: `youtube:${ytId}`,
      });
      await this.videoRepository.save(video);
      this.logger.log(`Created YouTube video entry: id="${videoId}", title="${videoTitle}", ytId="${ytId}"`);
    } else {
      video.title = videoTitle;
      video.blobPrefix = `youtube:${ytId}`;
      await this.videoRepository.save(video);
      this.logger.log(`Updated YouTube video entry: id="${videoId}", title="${videoTitle}"`);
    }

    // Auto-grant access to common student accounts so it appears immediately
    const studentIds = ['demo_user_1', 'student_1', 'admin_1', 'shehal32'];
    for (const userId of studentIds) {
      try {
        const existingPurchase = await this.purchaseRepository.findOne({ where: { userId, videoId } });
        if (!existingPurchase) {
          const purchase = this.purchaseRepository.create({
            userId,
            videoId,
          });
          await this.purchaseRepository.save(purchase);
        }
      } catch (err) {
        // Ignore entitlement uniqueness collisions
      }
    }

    return video;
  }

  /**
   * Permanently deletes a video, its cryptographic keys, entitlements, watermark logs,
   * and any corresponding Azure Blob Storage files.
   */
  async deleteVideo(videoId: string): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Deleting video "${videoId}" and all associated keys, entitlements, and assets`);

    // 1. Delete associated keys
    await this.videoKeyRepository.delete({ videoId });

    // 2. Delete associated purchases / entitlements
    await this.purchaseRepository.delete({ videoId });

    // 3. Delete associated watermark logs
    await this.watermarkLogRepository.delete({ videoId });

    // 4. Delete from Azure Blob Storage if configured
    const azureConn = this.configService.get<string>('azureStorageConnectionString');
    const containerName = this.configService.get<string>('azureStorageContainerName') || 'videos';
    if (azureConn) {
      try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(azureConn);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const prefix = `videos/${videoId}/`;
        for await (const blob of containerClient.listBlobsFlat({ prefix })) {
          await containerClient.deleteBlob(blob.name);
        }
        this.logger.log(`Deleted Azure Blobs for video "${videoId}" with prefix "${prefix}"`);
      } catch (err: any) {
        this.logger.warn(`Azure blob deletion notice for "${videoId}": ${err.message}`);
      }
    }

    // 5. Delete video record from database
    const result = await this.videoRepository.delete({ id: videoId });
    if (result.affected === 0) {
      this.logger.warn(`Video "${videoId}" was not present in database, but cleaned related records.`);
    }

    return {
      success: true,
      message: `Video "${videoId}" and associated keys and storage assets were successfully deleted.`,
    };
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(this.ffmpegPath, args, (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(`FFmpeg error: ${error.message}\n${stderr}`));
        }
        resolve();
      });
    });
  }
}
