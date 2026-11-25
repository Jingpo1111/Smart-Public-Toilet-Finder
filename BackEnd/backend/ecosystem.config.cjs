/**
 * Optional PM2 configuration for running the built API directly on Ubuntu Server (no Docker).
 *   npm ci && npx prisma migrate deploy && npm run build
 *   pm2 start ecosystem.config.cjs && pm2 save
 * Put HTTPS in front with Nginx/Caddy or a Cloudflare Tunnel and set TRUST_PROXY=1.
 *
 * Keep instances at 1 unless you add a shared store for rate limiting (the default throttler
 * storage is in-memory per process). The hourly upload clean-up job is idempotent.
 */
module.exports = {
  apps: [
    {
      name: 'toiletgo-api',
      script: 'dist/src/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      // Environment variables are read from the process environment or from .env in this folder.
      time: true,
    },
  ],
};
