import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Video } from './video.entity';

@Entity('video_keys')
@Unique(['videoId', 'keyIndex'])
export class VideoKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar' })
  videoId!: string;

  @ManyToOne(() => Video, (video) => video.keys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'videoId' })
  video!: Video;

  @Column({ type: 'int', default: 0 })
  keyIndex!: number;

  @Column({ type: 'int', default: 0 })
  keyPeriod!: number;

  // 16-byte raw AES key hex-encoded (32 chars)
  @Column({ type: 'varchar', length: 32 })
  keyHex!: string;

  // Optional 16-byte IV hex-encoded (32 chars)
  @Column({ type: 'varchar', length: 32, nullable: true })
  ivHex?: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
