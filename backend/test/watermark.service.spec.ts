import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { WatermarkService } from '../src/modules/watermark/watermark.service';
import { WatermarkLog, User, DeviceSession } from '../src/modules/database/entities';

describe('WatermarkService', () => {
  let service: WatermarkService;
  let mockRepository: any;
  let mockUserRepository: any;
  let mockDeviceSessionRepository: any;
  const inMemoryLogs: WatermarkLog[] = [];

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'watermarkSecret') return 'test_secret_watermark_hmac_32_bytes';
      return null;
    }),
  };

  beforeEach(async () => {
    inMemoryLogs.length = 0;

    mockUserRepository = {
      findOne: jest.fn(async () => null),
    };

    mockDeviceSessionRepository = {
      findOne: jest.fn(async () => null),
    };

    mockRepository = {
      create: jest.fn((dto) => ({
        id: 'mock-uuid-' + Math.random(),
        ...dto,
        issuedAt: new Date(),
      })),
      save: jest.fn(async (entity) => {
        inMemoryLogs.push(entity);
        return entity;
      }),
      findOne: jest.fn(async ({ where }) => {
        return (
          inMemoryLogs.find(
            (l) =>
              l.userId === where.userId &&
              l.videoId === where.videoId &&
              l.sessionId === where.sessionId,
          ) || null
        );
      }),
      find: jest.fn(async (options) => {
        if (options && options.where && options.where.videoId) {
          return inMemoryLogs.filter((l) => l.videoId === options.where.videoId);
        }
        return [...inMemoryLogs];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatermarkService,
        {
          provide: getRepositoryToken(WatermarkLog),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(DeviceSession),
          useValue: mockDeviceSessionRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<WatermarkService>(WatermarkService);
  });

  describe('generateSessionPattern', () => {
    it('should be deterministic for identical inputs', () => {
      const pattern1 = service.generateSessionPattern('user_101', 'vid_123', 'sess_abc', 50);
      const pattern2 = service.generateSessionPattern('user_101', 'vid_123', 'sess_abc', 50);

      expect(pattern1).toBeDefined();
      expect(pattern1.length).toBe(50);
      expect(pattern1).toBe(pattern2);
      expect(/^[01]+$/.test(pattern1)).toBe(true);
    });

    it('should produce different patterns for different session IDs', () => {
      const pattern1 = service.generateSessionPattern('user_101', 'vid_123', 'sess_A', 30);
      const pattern2 = service.generateSessionPattern('user_101', 'vid_123', 'sess_B', 30);

      expect(pattern1).not.toBe(pattern2);
    });

    it('should produce different patterns for different user IDs', () => {
      const pattern1 = service.generateSessionPattern('user_101', 'vid_123', 'sess_common', 30);
      const pattern2 = service.generateSessionPattern('user_102', 'vid_123', 'sess_common', 30);

      expect(pattern1).not.toBe(pattern2);
    });

    it('should support long segment counts spanning multi-block HMAC iterations (>256 bits)', () => {
      const longPattern = service.generateSessionPattern('user_101', 'vid_123', 'sess_long', 500);

      expect(longPattern.length).toBe(500);
      expect(/^[01]+$/.test(longPattern)).toBe(true);
    });
  });

  describe('identifyLeaker (Forensic Hamming Distance Matcher)', () => {
    beforeEach(async () => {
      // Seed 3 different active sessions for video vid_test
      await service.getOrCreateSessionPattern('alice', 'vid_test', 'sess_alice_1', 60);
      await service.getOrCreateSessionPattern('bob', 'vid_test', 'sess_bob_1', 60);
      await service.getOrCreateSessionPattern('charlie', 'vid_test', 'sess_charlie_1', 60);
    });

    it('should identify leaker session with 100% exact pattern match (0% error)', async () => {
      const alicePattern = service.generateSessionPattern('alice', 'vid_test', 'sess_alice_1', 60);

      const result = await service.identifyLeaker('vid_test', alicePattern, 0.2);

      expect(result).toBeDefined();
      expect(result?.matchFound).toBe(true);
      expect(result?.userId).toBe('alice');
      expect(result?.sessionId).toBe('sess_alice_1');
      expect(result?.hammingDistance).toBe(0);
      expect(result?.confidence).toBe(1);
    });

    it('should identify leaker session when small re-encoding bit errors are injected (10% noise)', async () => {
      const bobPattern = service.generateSessionPattern('bob', 'vid_test', 'sess_bob_1', 60);

      // Inject 6 bit flips out of 60 bits (10% noise)
      const noisyBobPattern = bobPattern
        .split('')
        .map((bit, idx) => (idx % 10 === 0 ? (bit === '0' ? '1' : '0') : bit))
        .join('');

      const result = await service.identifyLeaker('vid_test', noisyBobPattern, 0.2);

      expect(result).toBeDefined();
      expect(result?.matchFound).toBe(true);
      expect(result?.userId).toBe('bob');
      expect(result?.sessionId).toBe('sess_bob_1');
      expect(result?.hammingDistance).toBe(6);
      expect(result?.errorRate).toBe(0.1);
      expect(result?.confidence).toBe(0.9);
    });

    it('should return null when noise exceeds maxErrorRate threshold (e.g. 50% random bits)', async () => {
      // 60 random bits that do not correspond to any valid session
      const randomBits = '101010101010101010101010101010101010101010101010101010101010';

      const result = await service.identifyLeaker('vid_test', randomBits, 0.15);

      expect(result).toBeNull();
    });

    it('should return null if extractedPattern is empty or invalid', async () => {
      const result = await service.identifyLeaker('vid_test', '');
      expect(result).toBeNull();
    });
  });
});
