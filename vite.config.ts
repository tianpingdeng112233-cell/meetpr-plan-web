/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: browser calls same-origin /api/*, Vite proxies to the MeetPR backend.
// Sidesteps CORS + mixed-content. Defaults to a loopback server; an explicitly
// configured remote HTTP target is allowed (production itself is still plain
// HTTP today) but warned about — switch to HTTPS once the backend domain lands.
function devApiTarget(mode: string): string {
  const env = loadEnv(mode, '.', '')
  const target = env.MEETPR_DEV_BACKEND_TARGET ?? 'http://127.0.0.1:3000'
  const url = new URL(target)
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !local) {
    console.warn(
      `[meetpr-plan-web] dev proxy targets ${target} over plain HTTP — `
      + 'login credentials cross the network unencrypted. Use HTTPS once available.',
    )
  }
  return target
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/api': {
        target: devApiTarget(mode),
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
}))
