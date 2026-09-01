import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('anomaly_flags')
@Index(['userId', 'createdAt'])
export class AnomalyFlag {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  @Index()
  userId!: string;

  @Column({ type: 'varchar' })
  sessionId!: string;

  @Column({ type: 'varchar' })
  currentIp!: string;

  @Column({ type: 'varchar', nullable: true })
  prevIp!: string;

  @Column({ type: 'varchar', nullable: true })
  currentGeo!: string;

  @Column({ type: 'varchar', nullable: true })
  prevGeo!: string;

  @Column({ type: 'float', default: 0 })
  distanceKm!: number;

  @Column({ type: 'float', default: 0 })
  timeDeltaHours!: number;

  @Column({ type: 'float', default: 0 })
  implausibleSpeedKmh!: number;

  @Column({ type: 'varchar', default: 'log_only' })
  actionTaken!: 'log_only' | 'require_reverify' | 'blocked';

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
