import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DeviceSession } from '../src/modules/database/entities';
import { DeviceBindingService } from '../src/security/device-binding/device-binding.service';
import { SessionLimitService } from '../src/security/session-limits/session-limit.service';
import { GeoAnomalyService } from '../src/security/geo-anomaly/geo-anomaly.service';
import { AuditService } from '../src/security/audit/audit.service';

describe('DeviceBindingService', () => {
  let service: DeviceBindingService;
  let mockDeviceSessionRepo: any;
  let mockSessionLimitService: any;
  let mockGeoAnomalyService: any;
  let mockAuditService: any;

  beforeEach(async () => {
    mockDeviceSessionRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 'mock-uuid', issuedAt: new Date(), lastSeenAt: new Date() })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    mockSessionLimitService = {
      enforceLimit: jest.fn().mockResolvedValue({ allowed: true, activeCount: 1 }),
    };

    mockGeoAnomalyService = {
      resolveLocation: jest.fn().mockReturnValue({ locationStr: 'Local/Dev Environment (Localhost)' }),
      checkAnomaly: jest.fn().mockResolvedValue({ isAnomaly: false, actionTaken: 'log_only' }),
    };

    mockAuditService = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceBindingService,
        {
          provide: getRepositoryToken(DeviceSession),
          useValue: mockDeviceSessionRepo,
        },
        {
          provide: SessionLimitService,
          useValue: mockSessionLimitService,
        },
        {
          provide: GeoAnomalyService,
          useValue: mockGeoAnomalyService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<DeviceBindingService>(DeviceBindingService);
  });

  it('should register and bind a new device session successfully', async () => {
    mockDeviceSessionRepo.findOne.mockResolvedValue(null);

    const result = await service.registerOrTouchSession({
      userId: 'student_alice',
      sessionId: 'sess_alice_001',
      deviceFingerprint: 'fp_sha256_alice_device',
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0 Chrome',
    });

    expect(result.userId).toBe('student_alice');
    expect(result.deviceFingerprint).toBe('fp_sha256_alice_device');
    expect(mockSessionLimitService.enforceLimit).toHaveBeenCalledWith('student_alice', 'sess_alice_001', 2);
    expect(mockAuditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'SESSION_CREATED', userId: 'student_alice' }),
    );
  });

  it('should verify matching device fingerprint cleanly', async () => {
    mockDeviceSessionRepo.findOne.mockResolvedValue({
      userId: 'student_alice',
      sessionId: 'sess_alice_001',
      deviceFingerprint: 'fp_sha256_alice_device',
      isRevoked: false,
      lastSeenAt: new Date(),
    });

    const isVerified = await service.verifyBinding(
      'student_alice',
      'sess_alice_001',
      'fp_sha256_alice_device',
    );

    expect(isVerified).toBe(true);
  });

  it('should reject token replay from a different device fingerprint with ForbiddenException', async () => {
    mockDeviceSessionRepo.findOne.mockResolvedValue({
      userId: 'student_alice',
      sessionId: 'sess_alice_001',
      deviceFingerprint: 'fp_sha256_alice_device',
      isRevoked: false,
      lastSeenAt: new Date(),
    });

    await expect(
      service.verifyBinding(
        'student_alice',
        'sess_alice_001',
        'fp_sha256_bob_stolen_replay_device',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockAuditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'FINGERPRINT_MISMATCH' }),
    );
  });

  it('should reject requests for evicted/revoked sessions with UnauthorizedException', async () => {
    mockDeviceSessionRepo.findOne.mockResolvedValue({
      userId: 'student_alice',
      sessionId: 'sess_alice_001',
      deviceFingerprint: 'fp_sha256_alice_device',
      isRevoked: true,
      revokedReason: 'EVICTED_CONCURRENCY_LIMIT',
      lastSeenAt: new Date(),
    });

    await expect(
      service.verifyBinding(
        'student_alice',
        'sess_alice_001',
        'fp_sha256_alice_device',
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});
