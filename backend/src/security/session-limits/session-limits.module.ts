import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceSession } from '../../modules/database/entities';
import { SessionLimitService } from './session-limit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DeviceSession])],
  providers: [SessionLimitService],
  exports: [SessionLimitService],
})
export class SessionLimitsModule {}
