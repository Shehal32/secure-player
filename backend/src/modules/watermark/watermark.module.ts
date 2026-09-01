import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { WatermarkLog, User, DeviceSession, SecurityAuditLog } from '../database/entities';
import { WatermarkService } from './watermark.service';
import { WatermarkController } from './watermark.controller';
import { GeoAnomalyModule } from '../../security/geo-anomaly/geo-anomaly.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([WatermarkLog, User, DeviceSession, SecurityAuditLog]),
    ConfigModule,
    GeoAnomalyModule,
  ],
  controllers: [WatermarkController],
  providers: [WatermarkService],
  exports: [WatermarkService],
})
export class WatermarkModule {}
