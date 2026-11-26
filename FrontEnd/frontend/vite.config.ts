import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const production = mode === 'production'
  const modeKey = production ? 'VITE_API_BASE_URL_PUBLIC' : 'VITE_API_BASE_URL_LOCAL'
  const backendKey = env.VITE_API_BASE_URL ? 'VITE_API_BASE_URL' : modeKey
  const backend = env[backendKey]?.trim() || (production ? '/api' : 'http://localhost:3005/api')
  if (/https?:\/\/[\s\S]*https?:\/\//i.test(backend)) {
    throw new Error(`${backendKey} contains multiple URLs. Set it to one API base address.`)
  }
  return {
    plugins: [vue()],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(backend),
      'import.meta.env.VITE_API_CONTRACT': JSON.stringify(
        env.VITE_API_CONTRACT || (production ? 'bundled' : 'live'),
      ),
    },
    test: { setupFiles: ['tests/setup.ts'], environment: 'jsdom', include: ['tests/**/*.test.ts'] },
  }
})
