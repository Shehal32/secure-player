import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceSession, AnomalyFlag } from '../../modules/database/entities';
import { DeviceBindingService } from './device-binding.service';
import { AccountSessionsController } from './account-sessions.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DeviceSession, AnomalyFlag])],
  controllers: [AccountSessionsController],
  providers: [DeviceBindingService],
  exports: [DeviceBindingService],
})
export class DeviceBindingModule {}
