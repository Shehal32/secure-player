import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { VideoKey } from '../database/entities';
import { KeysService } from './keys.service';
import { KeysController } from './keys.controller';
import { EntitlementModule } from '../entitlement/entitlement.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoKey]),
    ConfigModule,
    EntitlementModule,
  ],
  controllers: [KeysController],
  providers: [KeysService],
  exports: [KeysService],
})
export class KeysModule {}
