import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const production = mode === 'production'
  const backend = production
    ? env.VITE_API_BASE_URL_PUBLIC || '/api'
    : env.VITE_API_BASE_URL_LOCAL || 'http://localhost:3000/api'
  return {
    plugins: [vue()],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || backend),
      'import.meta.env.VITE_API_CONTRACT': JSON.stringify(
        env.VITE_API_CONTRACT || (production ? 'bundled' : 'live'),
      ),
    },
    test: { setupFiles: ['tests/setup.ts'], environment: 'jsdom', include: ['tests/**/*.test.ts'] },
  }
})
