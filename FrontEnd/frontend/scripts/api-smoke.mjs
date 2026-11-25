// Read-only connectivity check. Never reads tokens or database credentials.
import { loadEnv } from 'vite'
const env = loadEnv('development', '.', 'VITE_API_BASE_URL')
const base = (env.VITE_API_BASE_URL || env.VITE_API_BASE_URL_LOCAL || 'http://localhost:3000/api').replace(/\/$/, '')
async function read(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('HTTP ' + response.status + ' at ' + url)
  return response.json()
}
try {
  const health = await read(base + '/health')
  if (health.success === false) throw new Error('Health endpoint reported failure')
  console.log('Health endpoint responded.')
  const document = await read(process.env.OPENAPI_URL ?? base + '/docs-json')
  if (!document.paths) throw new Error('OpenAPI document has no paths')
  const list = await read(base + '/toilets?limit=1')
  if (!Array.isArray(list.data)) throw new Error('Unexpected WC list envelope')
  for (const wc of list.data) {
    if (wc.isVerified !== true || wc.archivedAt)
      throw new Error('Public listing returned a non-public record')
  }
  console.log('OpenAPI and verified WC listing responded.')
} catch (e) {
  console.error('API check failed:', e.cause?.code ?? e.message)
  process.exitCode = 1
}
