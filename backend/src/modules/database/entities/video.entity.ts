import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { VideoKey } from './video-key.entity';
import { Purchase } from './purchase.entity';

@Entity('videos')
export class Video {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'varchar' })
  blobPrefix!: string;

  @Column({ type: 'float', nullable: true })
  duration?: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;

  @OneToMany(() => VideoKey, (key) => key.video, { cascade: true })
  keys!: VideoKey[];

  @OneToMany(() => Purchase, (purchase) => purchase.video)
  purchases!: Purchase[];
}
