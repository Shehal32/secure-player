import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Purchase } from '../database/entities';
import { EntitlementService } from './entitlement.service';

@Module({
  imports: [TypeOrmModule.forFeature([Purchase])],
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementModule {}
