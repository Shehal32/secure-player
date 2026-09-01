import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type SecurityAuditEventType =
  | 'SESSION_CREATED'
  | 'SESSION_EVICTED'
  | 'KEY_REQUESTED'
  | 'ANOMALY_FLAGGED'
  | 'DEVICE_REVOKED'
  | 'FINGERPRINT_MISMATCH'
  | 'DOWNLOAD_GUARD_BLOCKED';

@Entity('security_audit_logs')
@Index(['userId', 'createdAt'])
@Index(['videoId', 'createdAt'])
@Index(['sessionId'])
export class SecurityAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  eventType!: SecurityAuditEventType;

  @Column({ type: 'varchar' })
  @Index()
  userId!: string;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  videoId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  ip!: string;

  @Column({ type: 'varchar', nullable: true })
  userAgent!: string;

  @Column({ type: 'varchar', nullable: true })
  deviceFingerprintHash!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
