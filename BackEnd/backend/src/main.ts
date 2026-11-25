import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './swagger';

async function bootstrap() {
  // bodyParser: false — JSON parsing is configured explicitly in configureApp (no urlencoded forms).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  const config = app.get(AppConfigService);
  if (config.swaggerEnabled) setupSwagger(app);

  await app.listen(config.port);
  const logger = new Logger('Bootstrap');
  logger.log(`ToiletGo KH API listening on http://localhost:${config.port}/${API_PREFIX} (${config.nodeEnv})`);
  if (config.swaggerEnabled) logger.log(`Swagger UI: http://localhost:${config.port}/${API_PREFIX}/docs`);
  if (!config.smtp.configured) logger.warn('SMTP is not configured: /auth/forgot-password will return 503.');
}

void bootstrap();
