import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { DatabaseModule } from './modules/database/database.module';
import { BlobModule } from './modules/blob/blob.module';
import { KeysModule } from './modules/keys/keys.module';
import { EntitlementModule } from './modules/entitlement/entitlement.module';
import { PlaylistModule } from './modules/playlist/playlist.module';
import { AuthModule } from './modules/auth/auth.module';
import { UploadModule } from './modules/upload/upload.module';
import { WatermarkModule } from './modules/watermark/watermark.module';
import { AuditModule } from './security/audit/audit.module';
import { SessionLimitsModule } from './security/session-limits/session-limits.module';
import { GeoAnomalyModule } from './security/geo-anomaly/geo-anomaly.module';
import { DeviceBindingModule } from './security/device-binding/device-binding.module';
import { DownloadGuardMiddleware } from './common/middleware/download-guard.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 60 seconds
        limit: 120, // 120 requests per minute general
      },
    ]),
    DatabaseModule,
    BlobModule,
    KeysModule,
    EntitlementModule,
    PlaylistModule,
    AuthModule,
    UploadModule,
    WatermarkModule,
    AuditModule,
    SessionLimitsModule,
    GeoAnomalyModule,
    DeviceBindingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(DownloadGuardMiddleware)
      .forRoutes(
        { path: 'playlist/(.*)', method: RequestMethod.GET },
        { path: 'keys/(.*)', method: RequestMethod.GET },
      );
  }
}
