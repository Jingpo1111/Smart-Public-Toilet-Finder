import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

const DESCRIPTION = `
REST API for **ToiletGo KH — Smart Public Toilet Finder in Cambodia** (pilot: Phnom Penh).
Currency: KHR (integer riel). Timezone: Asia/Phnom_Penh. Languages: English / Khmer.

### Response envelope
Success: \`{ "success": true, "data": …, "message": "…" }\`.
Paginated lists add \`"meta": { "page", "limit", "total", "totalPages" }\` (query: \`page\`, \`limit\` ≤ 100).
Errors: \`{ "success": false, "statusCode", "error", "message", "details"?, "path", "timestamp" }\`.
Validation errors (400) list \`details: [{ field, errors[] }]\`. Unknown properties are rejected.

### Authentication contract
1. \`POST /auth/login\` or \`/auth/register\` → \`data.accessToken\` (JWT, ~15 min) **and** an HttpOnly
   cookie \`tg_refresh\` (path \`/api/auth\`, SameSite configurable, Secure in production).
2. Send \`Authorization: Bearer <accessToken>\` on protected requests. Keep the access token in memory.
3. When a request returns 401, call \`POST /auth/refresh\` **with credentials** (cookies) and header
   \`X-CSRF-Protection: 1\`. The refresh cookie is rotated; re-using an old one revokes the session family.
4. \`POST /auth/logout\` (same header) revokes the session. Roles are always taken from the database.

### Image uploads
Upload first (\`multipart/form-data\`, field \`files\`, ≤ 5 × 5 MB, JPG/PNG/WebP), receive image IDs, then
reference them in JSON (\`imageIds\`). All buckets are private; images are returned as short-lived signed
URLs with \`expiresAt\`. Pending/rejected submission photos are only visible to the contributor and admins.

### Distances
Distances are **approximate straight-line (Haversine) distances**, not walking or driving routes.
Nearby search uses query parameters \`lat\`, \`lng\` and \`radius\` (metres).
`;

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('ToiletGo KH API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0.0')
    .addServer('http://localhost:3000', 'Local development')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token from /auth/login' })
    .addCookieAuth('tg_refresh', { type: 'apiKey', in: 'cookie', name: 'tg_refresh' }, 'refresh-cookie')
    .build();
  return SwaggerModule.createDocument(app, config, { operationIdFactory: (controller, method) => `${controller.replace(/Controller$/, '')}_${method}` });
}

export function setupSwagger(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'ToiletGo KH API',
    swaggerOptions: { persistAuthorization: false, withCredentials: true },
  });
}
