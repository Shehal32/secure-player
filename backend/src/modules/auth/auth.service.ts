import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { User, Purchase, Video, UserRole } from '../database/entities';

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    studentId: string | null;
    name: string;
    email: string;
    role: UserRole;
  };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
  ) {}

  /**
   * Seed default Admin account and default Student on application startup.
   */
  async onModuleInit() {
    try {
      // 1. Ensure Default Admin Account
      const adminEmail = 'admin@eduone.com';
      let admin = await this.userRepository.findOne({ where: { email: adminEmail } });
      if (!admin) {
        const adminPasswordHash = this.hashPassword('Admin@Secure2026!');
        admin = this.userRepository.create({
          id: 'admin_root',
          studentId: null,
          name: 'SecOps Administrator',
          email: adminEmail,
          passwordHash: adminPasswordHash,
          role: 'ADMIN',
        });
        await this.userRepository.save(admin);
        this.logger.log(`[SEED] Created default Admin account (${adminEmail})`);
      }
    } catch (err: any) {
      this.logger.warn(`AuthService seed notice: ${err.message}`);
    }
  }

  /**
   * Password Hashing using PBKDF2 with SHA-512 and random 16-byte salt.
   */
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Constant-time password verification.
   */
  verifyPassword(password: string, storedHash: string): boolean {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [salt, originalHash] = storedHash.split(':');
    const hashToVerify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(
      Buffer.from(hashToVerify, 'utf8'),
      Buffer.from(originalHash, 'utf8'),
    );
  }

  /**
   * Generates a unique 10-digit Student ID (e.g. SID-8392019482).
   */
  private generateStudentId(): string {
    const random10Digits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    return `SID-${random10Digits}`;
  }

  /**
   * Register a new student account. Automatically assigns unique SID-[10 digits].
   */
  async registerStudent(dto: {
    name: string;
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check if email already registered
    const existing = await this.userRepository.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      throw new BadRequestException('An account with this email address already exists.');
    }

    if (!dto.password || dto.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters long.');
    }

    const studentId = this.generateStudentId();
    const passwordHash = this.hashPassword(dto.password);

    const user = this.userRepository.create({
      id: studentId,
      studentId,
      name: dto.name?.trim() || 'Student',
      email: normalizedEmail,
      passwordHash,
      role: 'STUDENT',
    });

    await this.userRepository.save(user);

    // Auto-grant entitlement to all existing course lecture videos
    const videos = await this.videoRepository.find();
    for (const vid of videos) {
      await this.grantEntitlement(user.id, vid.id, user.email);
    }

    this.logger.log(`[STUDENT REGISTERED] Created student account: ${studentId} (${normalizedEmail})`);

    const token = this.generateUserJwt(user.id, user.email, user.role);

    return {
      token,
      user: {
        id: user.id,
        studentId: user.studentId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Authenticate student or administrator by email / student ID and password.
   */
  async login(dto: {
    identifier: string;
    password: string;
    requiredRole?: UserRole;
  }): Promise<AuthResponse> {
    const rawIdentifier = dto.identifier.trim();
    const normalizedEmail = rawIdentifier.toLowerCase();

    // Find by email or by studentId / id
    const user = await this.userRepository.findOne({
      where: [
        { email: normalizedEmail },
        { studentId: rawIdentifier },
        { id: rawIdentifier },
      ],
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email/student ID or password.');
    }

    const isMatch = this.verifyPassword(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email/student ID or password.');
    }

    if (dto.requiredRole && user.role !== dto.requiredRole) {
      throw new ForbiddenException(
        `Access denied: This login portal requires ${dto.requiredRole} privileges.`,
      );
    }

    const token = this.generateUserJwt(user.id, user.email, user.role);

    this.logger.log(`[AUTH LOGIN] User logged in: ${user.id} (${user.email}, role=${user.role})`);

    return {
      token,
      user: {
        id: user.id,
        studentId: user.studentId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Generates signed JWT for playback & API authorization.
   */
  generateUserJwt(userId: string, email: string, role: UserRole = 'STUDENT'): string {
    return this.jwtService.sign({
      sub: userId,
      userId,
      email,
      role,
    });
  }

  /**
   * Grant entitlement to a video for a user.
   */
  async grantEntitlement(userId: string, videoId: string, email = `${userId}@example.com`): Promise<void> {
    let user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      const studentId = userId.startsWith('SID-') ? userId : this.generateStudentId();
      user = this.userRepository.create({
        id: userId,
        studentId,
        name: userId,
        email,
        role: 'STUDENT',
      });
      await this.userRepository.save(user);
    }

    let video = await this.videoRepository.findOne({ where: { id: videoId } });
    if (!video) {
      video = this.videoRepository.create({
        id: videoId,
        title: `Video ${videoId}`,
        blobPrefix: `videos/${videoId}/`,
      });
      await this.videoRepository.save(video);
    }

    let purchase = await this.purchaseRepository.findOne({ where: { userId, videoId } });
    if (!purchase) {
      purchase = this.purchaseRepository.create({
        userId,
        videoId,
        active: true,
      });
      await this.purchaseRepository.save(purchase);
    } else {
      purchase.active = true;
      await this.purchaseRepository.save(purchase);
    }
  }
}
