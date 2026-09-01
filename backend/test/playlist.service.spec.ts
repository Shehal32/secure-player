import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlaylistService } from '../src/modules/playlist/playlist.service';
import { BlobService } from '../src/modules/blob/blob.service';
import { KeysService } from '../src/modules/keys/keys.service';

describe('PlaylistService (M3U8 Rewriting & SAS Token Injection Unit Tests)', () => {
  let playlistService: PlaylistService;
  let blobService: Partial<Record<keyof BlobService, jest.Mock>>;
  let keysService: Partial<Record<keyof KeysService, jest.Mock>>;

  beforeEach(async () => {
    blobService = {
      batchGenerateSasUrls: jest.fn(),
    };

    keysService = {
      generateSessionToken: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'segmentSasTtlSeconds') return 300;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaylistService,
        { provide: BlobService, useValue: blobService },
        { provide: KeysService, useValue: keysService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    playlistService = module.get<PlaylistService>(PlaylistService);
  });

  it('should rewrite single-key manifest with session token and batch SAS URLs', () => {
    const rawM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-KEY:METHOD=AES-128,URI="/keys/vid_test",IV=0x0123456789abcdef0123456789abcdef
#EXTINF:6.000000,
segment_000.ts
#EXTINF:6.000000,
segment_001.ts
#EXT-X-ENDLIST`;

    keysService.generateSessionToken!.mockReturnValue('mock_session_token_xyz');

    blobService.batchGenerateSasUrls!.mockImplementation((videoId, segmentNames, ttl) => {
      const map = new Map<string, string>();
      map.set(
        'segment_000_a.ts',
        'https://myaccount.blob.core.windows.net/videos/videos/vid_test/segment_000_a.ts?st=sas1',
      );
      map.set(
        'segment_001_a.ts',
        'https://myaccount.blob.core.windows.net/videos/videos/vid_test/segment_001_a.ts?st=sas2',
      );
      return map;
    });

    const rewritten = playlistService.rewritePlaylist(rawM3u8, 'vid_test', 'user_123');

    // Verify session token was inserted in EXT-X-KEY URI with keyIndex
    expect(rewritten).toContain(
      'URI="/keys/vid_test?keyIndex=0&t=mock_session_token_xyz"',
    );

    // Verify segments were replaced with direct Azure SAS URLs
    expect(rewritten).toContain(
      'https://myaccount.blob.core.windows.net/videos/videos/vid_test/segment_000_a.ts?st=sas1',
    );
    expect(rewritten).toContain(
      'https://myaccount.blob.core.windows.net/videos/videos/vid_test/segment_001_a.ts?st=sas2',
    );

    // Verify batch SAS generation was called once with target watermarked variant segment names
    expect(blobService.batchGenerateSasUrls).toHaveBeenCalledTimes(1);
    expect(blobService.batchGenerateSasUrls).toHaveBeenCalledWith(
      'vid_test',
      ['segment_000_a.ts', 'segment_001_a.ts'],
      300,
    );
  });

  it('should correctly rewrite key-rotated manifest with multiple EXT-X-KEY tags', () => {
    const rawRotatedM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="/keys/vid_rot?keyIndex=0",IV=0xaaaa
#EXTINF:6.000000,
segment_000.ts
#EXTINF:6.000000,
segment_001.ts
#EXT-X-KEY:METHOD=AES-128,URI="/keys/vid_rot?keyIndex=1",IV=0xbbbb
#EXTINF:6.000000,
segment_002.ts
#EXT-X-ENDLIST`;

    keysService.generateSessionToken!.mockReturnValue('rotated_token_abc');
    blobService.batchGenerateSasUrls!.mockReturnValue(
      new Map([
        ['segment_000_a.ts', 'https://blob/segment_000_a.ts?sas=1'],
        ['segment_001_a.ts', 'https://blob/segment_001_a.ts?sas=2'],
        ['segment_002_a.ts', 'https://blob/segment_002_a.ts?sas=3'],
      ]),
    );

    const rewritten = playlistService.rewritePlaylist(rawRotatedM3u8, 'vid_rot', 'user_456');

    expect(rewritten).toContain('URI="/keys/vid_rot?keyIndex=0&t=rotated_token_abc"');
    expect(rewritten).toContain('URI="/keys/vid_rot?keyIndex=1&t=rotated_token_abc"');
    expect(rewritten).toContain('https://blob/segment_000_a.ts?sas=1');
    expect(rewritten).toContain('https://blob/segment_002_a.ts?sas=3');
  });
});
