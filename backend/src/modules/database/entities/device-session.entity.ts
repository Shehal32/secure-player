import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('device_sessions')
@Index(['userId', 'isRevoked'])
@Index(['sessionId'], { unique: true })
export class DeviceSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  userId!: string;

  @Column({ type: 'varchar' })
  sessionId!: string;

  @Column({ type: 'varchar' })
  deviceFingerprint!: string;

  @Column({ type: 'varchar', nullable: true })
  ip!: string;

  @Column({ type: 'varchar', nullable: true })
  userAgent!: string;

  @Column({ type: 'varchar', nullable: true })
  location!: string;

  @Column({ type: 'boolean', default: false })
  isRevoked!: boolean;

  @Column({ type: 'varchar', nullable: true })
  revokedReason!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  issuedAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  lastSeenAt!: Date;
}
