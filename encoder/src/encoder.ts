import * as fs from 'fs';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { EncodeOptions, EncodeResult, KeyPeriodInfo } from './types';
import { KeyGenerator } from './key-generator';
import { AzureUploader } from './uploader';
import { DatabaseWriter } from './db-writer';

export class VideoEncoder {
  private ffmpegPath: string;

  constructor(customFfmpegPath?: string) {
    this.ffmpegPath = this.resolveFfmpegPath(customFfmpegPath);
  }

  private resolveFfmpegPath(customPath?: string): string {
    if (customPath && fs.existsSync(customPath)) {
      return customPath;
    }
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
   * Encodes a video to encrypted AES-128 HLS with optional key rotation.
   */
  async encode(options: EncodeOptions): Promise<EncodeResult> {
    const {
      inputPath,
      videoId,
      segmentDuration = 6,
      keyRotationSegments = 0,
      uploadToAzure = false,
      saveToDatabase = false,
      databaseUrl = process.env.DATABASE_URL,
      azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING,
      azureContainerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'videos',
    } = options;

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }

    const outputDir =
      options.outputDir ||
      path.resolve(process.cwd(), 'output', videoId);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`[Encoder] Starting HLS AES-128 packaging for videoId: ${videoId}`);
    console.log(`[Encoder] FFmpeg binary: ${this.ffmpegPath}`);
    console.log(`[Encoder] Output directory: ${outputDir}`);

    const keys: KeyPeriodInfo[] = [];

    if (!keyRotationSegments || keyRotationSegments <= 0) {
      // Mode 1: Single Key for the whole video
      const { keyInfo, keyInfoFilePath } = KeyGenerator.generateKeyPeriod(
        videoId,
        0,
        0,
        outputDir,
      );
      keys.push(keyInfo);

      await this.runFfmpegSingleKey(
        inputPath,
        outputDir,
        keyInfoFilePath,
        segmentDuration,
      );
    } else {
      // Mode 2: Multi-Key Rotation (New key every N segments)
      console.log(`[Encoder] Key rotation enabled: rotating key every ${keyRotationSegments} segments`);
      const rotatedKeys = await this.runFfmpegWithKeyRotation(
        inputPath,
        outputDir,
        videoId,
        segmentDuration,
        keyRotationSegments,
      );
      keys.push(...rotatedKeys);
    }

    const playlistPath = path.join(outputDir, 'index.m3u8');
    const segmentFiles = fs
      .readdirSync(outputDir)
      .filter((f) => f.endsWith('.ts'));

    console.log(`[Encoder] Packaging complete: generated ${segmentFiles.length} encrypted segments.`);

    // Upload to Azure Blob Storage if requested
    let uploadedToAzure = false;
    if (uploadToAzure && azureConnectionString) {
      console.log(`[Encoder] Uploading HLS assets to Azure Blob Storage...`);
      await AzureUploader.uploadVideoAssets(
        outputDir,
        videoId,
        azureConnectionString,
        azureContainerName,
      );
      uploadedToAzure = true;
    }

    // Persist video and keys to PostgreSQL DB if requested
    let savedToDatabase = false;
    if (saveToDatabase && databaseUrl) {
      console.log(`[Encoder] Persisting keys to PostgreSQL...`);
      await DatabaseWriter.saveVideoAndKeys(
        databaseUrl,
        videoId,
        `Video ${videoId}`,
        keys,
      );
      savedToDatabase = true;
    }

    return {
      videoId,
      outputDir,
      playlistPath,
      segmentFiles,
      keys,
      uploadedToAzure,
      savedToDatabase,
    };
  }

  private async runFfmpegSingleKey(
    inputPath: string,
    outputDir: string,
    keyInfoFilePath: string,
    segmentDuration: number,
  ): Promise<void> {
    const playlistOutput = path.join(outputDir, 'index.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');

    const args = [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-profile:v', 'main',
      '-level', '3.1',
      '-pix_fmt', 'yuv420p',
      '-crf', '22',
      '-preset', 'fast',
      '-g', '60', // GOP size (2.4s at 25fps or close to keyframe boundaries)
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-hls_time', segmentDuration.toString(),
      '-hls_list_size', '0',
      '-hls_key_info_file', keyInfoFilePath,
      '-hls_segment_filename', segmentPattern,
      '-hls_playlist_type', 'vod',
      playlistOutput,
    ];

    await this.executeFfmpeg(args);
  }

  private async runFfmpegWithKeyRotation(
    inputPath: string,
    outputDir: string,
    videoId: string,
    segmentDuration: number,
    keyRotationSegments: number,
  ): Promise<KeyPeriodInfo[]> {
    // 1. First encode without encryption to inspect segments / chunk structure cleanly
    const tempDir = path.join(outputDir, '_raw_chunks');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const rawPlaylist = path.join(tempDir, 'raw.m3u8');
    const rawSegmentPattern = path.join(tempDir, 'raw_%03d.ts');

    const initialArgs = [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-profile:v', 'main',
      '-pix_fmt', 'yuv420p',
      '-crf', '22',
      '-preset', 'fast',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-hls_time', segmentDuration.toString(),
      '-hls_list_size', '0',
      '-hls_segment_filename', rawSegmentPattern,
      '-hls_playlist_type', 'vod',
      rawPlaylist,
    ];

    await this.executeFfmpeg(initialArgs);

    const rawSegments = fs
      .readdirSync(tempDir)
      .filter((f) => f.startsWith('raw_') && f.endsWith('.ts'))
      .sort();

    const keys: KeyPeriodInfo[] = [];
    const finalPlaylistLines: string[] = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${segmentDuration + 2}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
    ];

    // Encrypt each group of segments with a distinct key period
    for (let i = 0; i < rawSegments.length; i++) {
      const keyIndex = Math.floor(i / keyRotationSegments);
      const isNewKeyPeriod = i % keyRotationSegments === 0;

      if (isNewKeyPeriod) {
        const { keyInfo, keyInfoFilePath } = KeyGenerator.generateKeyPeriod(
          videoId,
          keyIndex,
          keyIndex * keyRotationSegments,
          outputDir,
        );
        keys.push(keyInfo);

        finalPlaylistLines.push(
          `#EXT-X-KEY:METHOD=AES-128,URI="${keyInfo.keyUri}",IV=0x${keyInfo.ivHex}`,
        );
      }

      const currentKey = keys[keyIndex];
      const rawSegPath = path.join(tempDir, rawSegments[i]);
      const segIndexStr = String(i).padStart(3, '0');
      const finalSegName = `segment_${segIndexStr}.ts`;
      const finalSegPath = path.join(outputDir, finalSegName);

      // Encrypt segment with AES-128-CBC using OpenSSL / Node crypto
      const rawBytes = fs.readFileSync(rawSegPath);
      const cipher = require('crypto').createCipheriv(
        'aes-128-cbc',
        currentKey.keyBuffer,
        Buffer.from(currentKey.ivHex, 'hex'),
      );
      const encryptedBytes = Buffer.concat([cipher.update(rawBytes), cipher.final()]);
      fs.writeFileSync(finalSegPath, encryptedBytes);

      finalPlaylistLines.push(`#EXTINF:${segmentDuration.toFixed(6)},`);
      finalPlaylistLines.push(finalSegName);
    }

    finalPlaylistLines.push('#EXT-X-ENDLIST');

    // Write final rotated M3U8
    fs.writeFileSync(
      path.join(outputDir, 'index.m3u8'),
      finalPlaylistLines.join('\n'),
      'utf8',
    );

    // Clean up temporary unencrypted chunks
    fs.rmSync(tempDir, { recursive: true, force: true });

    return keys;
  }

  private executeFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(this.ffmpegPath, args, (error, stdout, stderr) => {
        if (error) {
          console.error(`[FFmpeg Error]`, stderr);
          return reject(new Error(`FFmpeg exited with error: ${error.message}\n${stderr}`));
        }
        resolve();
      });
    });
  }
}
