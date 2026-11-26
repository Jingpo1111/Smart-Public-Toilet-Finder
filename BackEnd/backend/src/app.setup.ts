import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { CSRF_HEADER } from './common/guards/csrf.guard';
import { AppConfigService } from './config/app-config.service';

export const API_PREFIX = 'api';

/**
 * HTTP-level configuration shared by main.ts, the OpenAPI export script and e2e tests.
 * - Only JSON bodies are parsed (plus multipart on upload routes via multer). URL-encoded form
 *   bodies are NOT parsed, so classic cross-site HTML form posts cannot reach JSON endpoints.
 * - Restricted CORS with credentials for the configured frontend origins only.
 */
export function configureApp(app: NestExpressApplication): INestApplication {
  const config = app.get(AppConfigService);

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.setGlobalPrefix(API_PREFIX);

  // gzip/deflate JSON and text responses (list endpoints are large and highly compressible).
  app.use(compression({ threshold: 1024 }));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI needs inline styles and data: images.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: config.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    }),
  );
  app.use(express.json({ limit: '200kb', type: ['application/json', 'application/*+json'] }));
  // Body-parser errors (malformed JSON, oversized body) answered in the standard error envelope.
  app.use((err: { type?: string }, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const known: Record<string, [number, string, string]> = {
      'entity.parse.failed': [400, 'Bad Request', 'Malformed JSON request body.'],
      'entity.too.large': [413, 'Payload Too Large', 'Request body is too large.'],
      'encoding.unsupported': [415, 'Unsupported Media Type', 'Unsupported request body encoding.'],
    };
    const hit = err?.type ? known[err.type] : undefined;
    if (!hit) return next(err);
    res.status(hit[0]).json({
      success: false,
      statusCode: hit[0],
      error: hit[1],
      message: hit[2],
      path: req.originalUrl.split('?')[0],
      timestamp: new Date().toISOString(),
    });
  });
  app.use(cookieParser());

  const allowed = new Set(config.frontendOrigins);
  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser clients (curl, server-to-server) send no Origin header.
      if (!origin || allowed.has(origin.replace(/\/+$/, ''))) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Accept-Language', CSRF_HEADER],
    exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
  return app;
}
