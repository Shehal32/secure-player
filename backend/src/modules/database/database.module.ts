import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  Video,
  VideoKey,
  User,
  Purchase,
  WatermarkLog,
  DeviceSession,
  AnomalyFlag,
  SecurityAuditLog,
} from './entities';

const ALL_ENTITIES = [
  Video,
  VideoKey,
  User,
  Purchase,
  WatermarkLog,
  DeviceSession,
  AnomalyFlag,
  SecurityAuditLog,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('databaseUrl');
        return {
          type: 'postgres',
          url,
          entities: ALL_ENTITIES,
          synchronize: true, // Auto-sync schema in dev mode
          logging: false,
        };
      },
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
