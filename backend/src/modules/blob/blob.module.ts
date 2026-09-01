import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlobService } from './blob.service';

@Module({
  imports: [ConfigModule],
  providers: [BlobService],
  exports: [BlobService],
})
export class BlobModule {}
