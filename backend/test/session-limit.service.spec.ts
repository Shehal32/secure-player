import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeviceSession } from '../src/modules/database/entities';
import { SessionLimitService } from '../src/security/session-limits/session-limit.service';
import { AuditService } from '../src/security/audit/audit.service';

describe('SessionLimitService', () => {
  let service: SessionLimitService;
  let mockDeviceSessionRepo: any;
  let mockAuditService: any;

  beforeEach(async () => {
    mockDeviceSessionRepo = {
      find: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    mockAuditService = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionLimitService,
        {
          provide: getRepositoryToken(DeviceSession),
          useValue: mockDeviceSessionRepo,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<SessionLimitService>(SessionLimitService);
  });

  it('should allow concurrent sessions when under the maximum limit of 2', async () => {
    mockDeviceSessionRepo.find.mockResolvedValue([
      { sessionId: 'sess_1', userId: 'alice', isRevoked: false, issuedAt: new Date(1000) },
    ]);

    const result = await service.enforceLimit('alice', 'sess_2', 2);
    expect(result.allowed).toBe(true);
    expect(result.evictedSessionId).toBeUndefined();
  });

  it('should evict the oldest active session when a 3rd concurrent session arrives', async () => {
    const session1 = { sessionId: 'sess_oldest_1', userId: 'alice', isRevoked: false, issuedAt: new Date(1000) };
    const session2 = { sessionId: 'sess_newer_2', userId: 'alice', isRevoked: false, issuedAt: new Date(2000) };

    mockDeviceSessionRepo.find.mockResolvedValue([session1, session2]);

    const result = await service.enforceLimit('alice', 'sess_incoming_3', 2);

    expect(result.allowed).toBe(true);
    expect(result.evictedSessionId).toBe('sess_oldest_1');
    expect(session1.isRevoked).toBe(true);
    expect((session1 as any).revokedReason).toBe('EVICTED_CONCURRENCY_LIMIT');
    expect(mockAuditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SESSION_EVICTED',
        sessionId: 'sess_oldest_1',
      }),
    );
  });
});
