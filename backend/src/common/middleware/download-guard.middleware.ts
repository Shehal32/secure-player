import { Injectable, NestMiddleware, ForbiddenException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DownloadGuardMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DownloadGuardMiddleware.name);

  // Extensible regex list for known automated download managers, sniffers & scraping tools
  private readonly blockedUserAgentPatterns: RegExp[] = [
    /internet\s*download\s*manager/i,
    /idm\//i,
    /jdownloader/i,
    /free\s*download\s*manager/i,
    /fdm\//i,
    /wget/i,
    /curl/i,
    /aria2/i,
    /youtube-dl/i,
    /yt-dlp/i,
    /ffmpeg/i,
    /lavf\//i,
    /python-requests/i,
    /aiohttp/i,
    /go-http-client/i,
    /libwww-perl/i,
    /httpclient/i,
    /postmanruntime/i,
    /insomnia/i,
    /downloadhelper/i,
    /vdh\//i,
    /stream\s*recorder/i,
    /fetchv/i,
    /cococut/i,
    /hls-downloader/i,
    /m3u8-downloader/i,
    /vlc\//i,
    /quicktime/i,
    /mpv\//i,
    /gstreamer/i,
    /puppeteer/i,
    /playwright/i,
    /selenium/i,
    /phantomjs/i,
    /headlesschrome/i,
  ];

  use(req: Request, res: Response, next: NextFunction) {
    const userAgent = req.headers['user-agent'] || '';
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const path = req.path;
    const secFetchDest = req.headers['sec-fetch-dest'] as string;

    // 1. Block known download managers and sniffers
    const isBlockedUA = this.blockedUserAgentPatterns.some((pattern) => pattern.test(userAgent));

    // 2. Block direct browser navigation / document downloads of sensitive endpoints
    const isDirectDocDownload =
      (path.startsWith('/playlist') || path.startsWith('/keys')) &&
      secFetchDest === 'document';

    if (isBlockedUA || isDirectDocDownload) {
      const videoIdMatch = path.match(/\/(?:playlist|keys)\/([^/?]+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';

      this.logger.warn(
        `[SECURITY AUDIT] Blocked download attempt: path=${path}, videoId=${videoId}, ip=${clientIp}, ua="${userAgent}", secFetchDest="${secFetchDest}"`,
      );

      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Automated video download or extraction is prohibited.',
      });
    }

    next();
  }
}
