import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { join } from 'path';
import { mkdirSync } from 'fs';
import * as express from 'express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Security headers. The CSP is left off because the admin panel loads its UI libraries
  // from a CDN; everything else (nosniff, frameguard, HSTS, referrer policy) applies.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Behind a reverse proxy or load balancer every request would otherwise appear to come
  // from the proxy's IP, and rate limiting would throttle all users together.
  if (process.env.TRUST_PROXY) {
    const expressApp = app.getHttpAdapter().getInstance() as express.Application;
    expressApp.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  }

  // The mobile app is not subject to CORS. In production only the origins listed in
  // CORS_ORIGINS (comma-separated) may call the API from a browser; the bundled admin
  // panel is same-origin and needs no entry.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? (corsOrigins.length ? corsOrigins : false) : '*',
  });

  // Lets in-flight requests and transactions finish on a deploy or restart
  app.enableShutdownHooks();

  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });

  const expressApp = app.getHttpAdapter().getInstance() as express.Application;
  // Serve admin panel at /admin (unaffected by global prefix)
  expressApp.use('/admin', express.static(join(__dirname, '..', 'admin-panel')));
  // Serve uploaded files at /uploads. nosniff (from helmet) stops a browser from treating
  // an uploaded file as anything other than the image type it was stored as.
  expressApp.use('/uploads', express.static(uploadsDir, { dotfiles: 'deny', index: false }));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Yala Nsafr API running on http://localhost:${port}/api/v1`);
  logger.log(`Admin panel at http://localhost:${port}/admin`);
}

bootstrap();
