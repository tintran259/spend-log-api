import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import * as compression from 'compression';
import helmet from 'helmet';

const REQUIRED_ENV = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'MAIL_USER',
  'MAIL_APP_PASSWORD',
];

const DB_ENV = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];

function validateEnv() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  // Accept either DATABASE_URL (Railway) or individual DB_* vars
  const missingDb = process.env.DATABASE_URL ? [] : DB_ENV.filter(k => !process.env[k]);
  const all = [...missing, ...missingDb];
  if (all.length) {
    throw new Error(`Missing required environment variables: ${all.join(', ')}`);
  }
}

async function bootstrap() {
  validateEnv();

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.setGlobalPrefix('api/v1');

  // ── Security headers
  app.use(helmet());

  // ── Gzip compression
  app.use(compression());

  // ── CORS — restrict to known origins in production
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) ?? [];
  app.enableCors({
    origin: process.env.NODE_ENV === 'production'
      ? (allowedOrigins.length ? allowedOrigins : false)
      : true,
    credentials: true,
  });

  // ── Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Server running on http://0.0.0.0:${port} [${process.env.NODE_ENV ?? 'development'}]`);
}

bootstrap();
