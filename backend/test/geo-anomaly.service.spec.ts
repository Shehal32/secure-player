import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AnomalyFlag, DeviceSession } from '../src/modules/database/entities';
import { GeoAnomalyService } from '../src/security/geo-anomaly/geo-anomaly.service';
import { AuditService } from '../src/security/audit/audit.service';

describe('GeoAnomalyService', () => {
  let service: GeoAnomalyService;
  let mockAnomalyRepo: any;
  let mockDeviceSessionRepo: any;
  let mockAuditService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockAnomalyRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
    };

    mockDeviceSessionRepo = {
      findOne: jest.fn(),
    };

    mockAuditService = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('log_only'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeoAnomalyService,
        {
          provide: getRepositoryToken(AnomalyFlag),
          useValue: mockAnomalyRepo,
        },
        {
          provide: getRepositoryToken(DeviceSession),
          useValue: mockDeviceSessionRepo,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<GeoAnomalyService>(GeoAnomalyService);
  });

  it('should accurately calculate Haversine distance between New York and London (~5,570 km)', () => {
    // New York: 40.7128° N, 74.0060° W
    // London: 51.5074° N, 0.1278° W
    const distance = service.calculateHaversineDistance(40.7128, -74.006, 51.5074, -0.1278);

    expect(distance).toBeGreaterThan(5500);
    expect(distance).toBeLessThan(5600);
  });

  it('should detect impossible travel (>900 km/h) and flag anomaly', async () => {
    // Previous session 10 minutes ago in New York (lat 40.7128, lon -74.0060)
    mockDeviceSessionRepo.findOne.mockResolvedValue({
      userId: 'alice',
      sessionId: 'sess_1',
      ip: '208.80.154.224', // New York / Wikimedia IP
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    });

    jest.spyOn(service, 'resolveLocation').mockImplementation((ip: string) => {
      if (ip === '208.80.154.224') {
        return { locationStr: 'New York, US', lat: 40.7128, lon: -74.006, country: 'US', city: 'New York' };
      }
      // London (lat 51.5074, lon -0.1278)
      return { locationStr: 'London, GB', lat: 51.5074, lon: -0.1278, country: 'GB', city: 'London' };
    });

    const result = await service.checkAnomaly('alice', 'sess_2', '185.15.56.1');

    expect(result.isAnomaly).toBe(true);
    expect(result.distanceKm).toBeGreaterThan(5500);
    expect(result.speedKmh).toBeGreaterThan(30000); // 5500 km in 10 mins = 33,000 km/h
    expect(mockAnomalyRepo.save).toHaveBeenCalled();
    expect(mockAuditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'ANOMALY_FLAGGED' }),
    );
  });
});
