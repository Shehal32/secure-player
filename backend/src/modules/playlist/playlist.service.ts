import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobService } from '../blob/blob.service';
import { KeysService } from '../keys/keys.service';

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);
  private readonly segmentSasTtlSeconds: number;

  constructor(
    private readonly blobService: BlobService,
    private readonly keysService: KeysService,
    private readonly configService: ConfigService,
  ) {
    this.segmentSasTtlSeconds = this.configService.get<number>('segmentSasTtlSeconds') || 300;
  }

  /**
   * Rewrites an HLS M3U8 manifest content:
   * 1. Appends short-lived signed session tokens to all EXT-X-KEY URIs.
   * 2. Replaces all segment filenames with direct Azure Blob Storage SAS URLs (batched in one pass).
   * 3. Selects Variant A or Variant B for forensic watermarking based on session pattern bitstring.
   */
  rewritePlaylist(
    rawM3u8: string,
    videoId: string,
    userId: string,
    sessionPattern?: string,
    sessionId?: string,
    incomingJwt?: string,
    basePath: string = '',
  ): string {
    const lines = rawM3u8.split(/\r?\n/);
    const sessionToken = this.keysService.generateSessionToken(userId, videoId, 21600, sessionId);
    const authQueryToken = incomingJwt || sessionToken;
    const cleanBasePath = basePath ? basePath.replace(/\/+$/, '') : '';

    // 0. Handle Master Playlist with multiple resolution tiers (#EXT-X-STREAM-INF)
    if (rawM3u8.includes('#EXT-X-STREAM-INF')) {
      const rewrittenMasterLines: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const variantName = trimmed.replace(/\.m3u8$/, '');
          rewrittenMasterLines.push(
            `${cleanBasePath}/playlist/${videoId}?variant=${variantName}&jwt=${authQueryToken}${sessionId ? `&sessionId=${sessionId}` : ''}`,
          );
        } else {
          rewrittenMasterLines.push(line);
        }
      }
      return rewrittenMasterLines.join('\n');
    }

    // 1. First pass: Collect all segment filenames to batch SAS token generation
    const segmentNames: string[] = [];
    let segmentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#')) {
        // Map to Variant A or Variant B if watermarking pattern is provided
        const targetSegment = this.resolveWatermarkedSegmentName(line, segmentIndex, sessionPattern);
        segmentNames.push(targetSegment);
        segmentIndex++;
      }
    }

    // 2. Batch-generate SAS URLs in a single pass (0 network calls, synchronous crypto)
    const sasMap = this.blobService.batchGenerateSasUrls(
      videoId,
      segmentNames,
      this.segmentSasTtlSeconds,
    );

    // 3. Second pass: Rewrite playlist lines
    const rewrittenLines: string[] = [];
    let currentSegmentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('#EXT-X-KEY')) {
        // Rewrite EXT-X-KEY tag to point to our secure key delivery route with session token
        line = this.rewriteKeyTag(trimmed, videoId, sessionToken, cleanBasePath);
      } else if (trimmed && !trimmed.startsWith('#')) {
        // Segment line: replace with batch-generated direct SAS URL for target variant
        const targetSegment = this.resolveWatermarkedSegmentName(trimmed, currentSegmentIndex, sessionPattern);
        const sasUrl = sasMap.get(targetSegment);
        if (sasUrl) {
          line = sasUrl;
        }
        currentSegmentIndex++;
      }

      rewrittenLines.push(line);
    }

    return rewrittenLines.join('\n');
  }

  /**
   * Resolves whether segment should be Variant A or Variant B based on forensic bit pattern.
   */
  private resolveWatermarkedSegmentName(
    originalSegmentName: string,
    segmentIndex: number,
    sessionPattern?: string,
  ): string {
    const baseName = originalSegmentName.replace(/(_a|_b)?\.ts$/, '');
    if (!sessionPattern || sessionPattern.length === 0) {
      return `${baseName}_a.ts`;
    }

    const bitIndex = segmentIndex % sessionPattern.length;
    const variantBit = sessionPattern[bitIndex];

    return variantBit === '1' ? `${baseName}_b.ts` : `${baseName}_a.ts`;
  }

  /**
   * Rewrites an EXT-X-KEY tag line to point to our secure /keys route with session token.
   */
  private rewriteKeyTag(
    keyTagLine: string,
    videoId: string,
    sessionToken: string,
    basePath: string = '',
  ): string {
    const uriMatch = keyTagLine.match(/URI="([^"]+)"/);
    if (!uriMatch) {
      return keyTagLine;
    }

    const originalUri = uriMatch[1];
    let keyIndex = 0;
    const indexMatch = originalUri.match(/keyIndex=(\d+)/);
    if (indexMatch) {
      keyIndex = parseInt(indexMatch[1], 10);
    }

    const cleanBasePath = basePath ? basePath.replace(/\/+$/, '') : '';
    const secureKeyUri = `${cleanBasePath}/keys/${encodeURIComponent(videoId)}?keyIndex=${keyIndex}&t=${encodeURIComponent(sessionToken)}`;
    return keyTagLine.replace(/URI="[^"]+"/, `URI="${secureKeyUri}"`);
  }
}
