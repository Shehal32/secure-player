import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('watermark_logs')
@Index(['videoId', 'userId'])
export class WatermarkLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar' })
  userId!: string;

  @Index()
  @Column({ type: 'varchar' })
  videoId!: string;

  @Index()
  @Column({ type: 'varchar' })
  sessionId!: string;

  // Binary string representing the A/B sequence e.g. "01001101..." (0 = A, 1 = B)
  @Column({ type: 'text' })
  pattern!: string;

  @Column({ type: 'int' })
  segmentCount!: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  issuedAt!: Date;
}
