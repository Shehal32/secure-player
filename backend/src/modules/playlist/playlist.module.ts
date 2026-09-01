import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlobModule } from '../blob/blob.module';
import { KeysModule } from '../keys/keys.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { PlaylistService } from './playlist.service';
import { PlaylistController } from './playlist.controller';

@Module({
  imports: [
    BlobModule,
    KeysModule,
    EntitlementModule,
    ConfigModule,
  ],
  controllers: [PlaylistController],
  providers: [PlaylistService],
  exports: [PlaylistService],
})
export class PlaylistModule {}
