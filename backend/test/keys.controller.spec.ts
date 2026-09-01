import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { KeysController } from '../src/modules/keys/keys.controller';
import { KeysService } from '../src/modules/keys/keys.service';
import { EntitlementService } from '../src/modules/entitlement/entitlement.service';
import { DeviceBindingService } from '../src/security/device-binding/device-binding.service';
import { AuditService } from '../src/security/audit/audit.service';

describe('KeysController (Security & Entitlement Unit Tests)', () => {
  let controller: KeysController;
  let keysService: Partial<Record<keyof KeysService, jest.Mock>>;
  let entitlementService: Partial<Record<keyof EntitlementService, jest.Mock>>;
  let configService: Partial<Record<keyof ConfigService, jest.Mock>>;
  let deviceBindingService: Partial<Record<keyof DeviceBindingService, jest.Mock>>;
  let auditService: Partial<Record<keyof AuditService, jest.Mock>>;

  const mockKeyBuffer = Buffer.from('0123456789abcdef0123456789abcdef', 'hex'); // 16 bytes

  beforeEach(async () => {
    keysService = {
      verifySessionToken: jest.fn(),
      getRawKeyBuffer: jest.fn(),
    };

    entitlementService = {
      canWatch: jest.fn(),
    };

    deviceBindingService = {
      verifyBinding: jest.fn().mockResolvedValue(true),
    };

    auditService = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'allowedOrigins') return ['http://localhost:3000', 'https://app.secureplayer.com'];
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KeysController],
      providers: [
        { provide: KeysService, useValue: keysService },
        { provide: EntitlementService, useValue: entitlementService },
        { provide: DeviceBindingService, useValue: deviceBindingService },
        { provide: AuditService, useValue: auditService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get<KeysController>(KeysController);
  });

  const createMockReqRes = (headers: Record<string, string> = {}) => {
    const req = {
      headers,
    } as unknown as Request;

    const resHeaders: Record<string, string> = {};
    let sentBody: any = null;

    const res = {
      setHeader: jest.fn((name: string, val: string) => {
        resHeaders[name.toLowerCase()] = val;
        return res;
      }),
      send: jest.fn((body: any) => {
        sentBody = body;
        return res;
      }),
    } as unknown as Response;

    return { req, res, resHeaders, getSentBody: () => sentBody };
  };

  describe('Denial & Security Enforcement Paths', () => {
    it('should throw UnauthorizedException when session token is missing', async () => {
      const { req, res } = createMockReqRes({ origin: 'http://localhost:3000' });

      await expect(
        controller.getKey('vid_123', '', '0', req, res),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException when Origin is not in allowlist', async () => {
      const { req, res } = createMockReqRes({ origin: 'http://malicious-site.com' });

      await expect(
        controller.getKey('vid_123', 'token_123', '0', req, res),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when Referer is not in allowlist', async () => {
      const { req, res } = createMockReqRes({ referer: 'http://pirate-portal.com/stream' });

      await expect(
        controller.getKey('vid_123', 'token_123', '0', req, res),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException when session token signature fails', async () => {
      const { req, res } = createMockReqRes({ origin: 'http://localhost:3000' });
      keysService.verifySessionToken!.mockImplementation(() => {
        throw new UnauthorizedException('Invalid session token signature');
      });

      await expect(
        controller.getKey('vid_123', 'invalid.token', '0', req, res),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException when token videoId does not match request videoId', async () => {
      const { req, res } = createMockReqRes({ origin: 'http://localhost:3000' });
      keysService.verifySessionToken!.mockReturnValue({
        userId: 'usr_1',
        videoId: 'vid_DIFFERENT',
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      await expect(
        controller.getKey('vid_123', 'valid_token', '0', req, res),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is NOT entitled (fail closed)', async () => {
      const { req, res } = createMockReqRes({ origin: 'http://localhost:3000' });
      keysService.verifySessionToken!.mockReturnValue({
        userId: 'usr_unpaid',
        videoId: 'vid_123',
        exp: Math.floor(Date.now() / 1000) + 60,
      });
      entitlementService.canWatch!.mockResolvedValue(false);

      await expect(
        controller.getKey('vid_123', 'valid_token', '0', req, res),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Authorized Key Delivery Path', () => {
    it('should deliver raw 16-byte buffer and set strict no-cache security headers', async () => {
      const { req, res, resHeaders, getSentBody } = createMockReqRes({
        origin: 'http://localhost:3000',
      });

      keysService.verifySessionToken!.mockReturnValue({
        userId: 'usr_paid',
        videoId: 'vid_123',
        exp: Math.floor(Date.now() / 1000) + 60,
      });
      entitlementService.canWatch!.mockResolvedValue(true);
      keysService.getRawKeyBuffer!.mockResolvedValue(mockKeyBuffer);

      await controller.getKey('vid_123', 'valid_token', '0', req, res);

      expect(keysService.getRawKeyBuffer).toHaveBeenCalledWith('vid_123', 0);
      expect(resHeaders['content-type']).toBe('application/octet-stream');
      expect(resHeaders['cache-control']).toContain('no-store');
      expect(resHeaders['pragma']).toBe('no-cache');
      expect(resHeaders['x-content-type-options']).toBe('nosniff');
      expect(getSentBody()).toEqual(mockKeyBuffer);
    });
  });
});
