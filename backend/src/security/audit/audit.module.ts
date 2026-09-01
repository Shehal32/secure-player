import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityAuditLog } from '../../modules/database/entities';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SecurityAuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
