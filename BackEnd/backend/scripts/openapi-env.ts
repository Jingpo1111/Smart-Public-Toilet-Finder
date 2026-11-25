/**
 * Placeholder configuration so the OpenAPI document can be generated without real credentials.
 * Nothing connects to the database or storage while exporting. Imported before the app module.
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://openapi:openapi@127.0.0.1:5432/openapi_export',
  JWT_SECRET: 'openapi-export-placeholder-secret-0123456789',
  JWT_REFRESH_SECRET: 'openapi-export-placeholder-refresh-0123456789',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'openapi-export-placeholder-key',
  THROTTLE_DISABLED: 'true',
};
for (const [k, v] of Object.entries(defaults)) {
  if (!process.env[k]) process.env[k] = v;
}
