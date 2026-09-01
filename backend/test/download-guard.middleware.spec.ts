import { ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DownloadGuardMiddleware } from '../src/common/middleware/download-guard.middleware';

describe('DownloadGuardMiddleware (Automated Downloader Defense Tests)', () => {
  let middleware: DownloadGuardMiddleware;
  let next: NextFunction;

  beforeEach(() => {
    middleware = new DownloadGuardMiddleware();
    next = jest.fn();
  });

  const runWithUserAgent = (userAgent: string, path = '/playlist/vid_123') => {
    const req = {
      headers: {
        'user-agent': userAgent,
      },
      path,
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;

    const res = {} as Response;

    return () => middleware.use(req, res, next);
  };

  describe('Blocking Prohibited Download Tools', () => {
    const blockedUserAgents = [
      'curl/7.88.1',
      'Wget/1.21.3',
      'Internet Download Manager 6.38',
      'Mozilla/5.0 IDM/6.41',
      'JDownloader 2.0',
      'aria2/1.36.0',
      'yt-dlp/2024.08.06',
      'youtube-dl/2021.12.17',
      'Lavf/58.76.100 (ffmpeg)',
      'python-requests/2.31.0',
      'PostmanRuntime/7.32.3',
      'Insomnia/2023.5.8',
    ];

    for (const ua of blockedUserAgents) {
      it(`should block User-Agent: "${ua}" with 403 Forbidden`, () => {
        expect(runWithUserAgent(ua)).toThrow(ForbiddenException);
        expect(next).not.toHaveBeenCalled();
      });
    }
  });

  describe('Allowing Legitimate Browser User-Agents', () => {
    const allowedUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0',
    ];

    for (const ua of allowedUserAgents) {
      it(`should allow browser User-Agent: "${ua.substring(0, 40)}..."`, () => {
        runWithUserAgent(ua)();
        expect(next).toHaveBeenCalled();
      });
    }
  });
});
