import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ensureDatabaseExists } from './modules/database/ensure-database';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Auto-create database if it does not exist
  await ensureDatabaseExists();

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3001;
  const allowedOrigins = configService.get<string[]>('allowedOrigins') || [];

  // Enable trust proxy for ngrok / reverse proxies to capture real client IP
  const expressApp = app.getHttpAdapter().getInstance();
  if (expressApp && typeof expressApp.set === 'function') {
    expressApp.set('trust proxy', true);
  }

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          mediaSrc: [
            "'self'",
            'blob:',
            'https://*.blob.core.windows.net',
            'https://*.azureedge.net',
            'http://localhost:*',
            'https://*.ngrok-free.dev',
            'https://*.ngrok-free.app',
            'https://*.ngrok.io',
          ],
          connectSrc: [
            "'self'",
            'blob:',
            'https://*.blob.core.windows.net',
            'https://*.azureedge.net',
            'http://localhost:*',
            'https://*.ngrok-free.dev',
            'https://*.ngrok-free.app',
            'https://*.ngrok.io',
          ],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl during dev, or same-origin)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.some((o) => origin.startsWith(o)) ||
        origin.includes('ngrok-free.dev') ||
        origin.includes('ngrok-free.app') ||
        origin.includes('ngrok.io') ||
        origin.includes('localhost')
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'x-device-fingerprint',
      'x-device-coords',
      'x-user-id',
      'Range',
    ],
    exposedHeaders: ['Content-Length', 'Content-Range', 'ETag', 'Cache-Control'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(port);
  logger.log(`Secure Player Backend is running on: http://localhost:${port}`);
}

bootstrap();
