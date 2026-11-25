/**
 * Writes the OpenAPI 3 specification to ./openapi.json for the frontend.
 *   npm run openapi:export
 * (runs after `nest build` so the Swagger CLI plugin metadata for DTOs is included).
 */
import './openapi-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { buildOpenApiDocument } from '../src/swagger';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'], bodyParser: false });
  configureApp(app);
  await app.init();
  const doc = buildOpenApiDocument(app);
  const out = resolve(__dirname, '..', '..', 'openapi.json');
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI specification written to ${out} (${Object.keys(doc.paths).length} paths)`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
