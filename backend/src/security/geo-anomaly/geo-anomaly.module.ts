import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnomalyFlag, DeviceSession } from '../../modules/database/entities';
import { GeoAnomalyService } from './geo-anomaly.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AnomalyFlag, DeviceSession])],
  providers: [GeoAnomalyService],
  exports: [GeoAnomalyService],
})
export class GeoAnomalyModule {}
