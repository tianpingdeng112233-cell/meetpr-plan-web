/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function buildIdPlugin(buildId: string) {
  return {
    name: 'meetpr-build-id',
    transformIndexHtml: {
      order: 'pre' as const,
      handler: () => [{
        tag: 'meta',
        attrs: { name: 'meetpr-build-id', content: buildId },
        injectTo: 'head' as const,
      }],
    },
  }
}

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

export default defineConfig(({ mode }) => {
  // Embedded in index.html so an open tab can recognize a newer web bundle.
  // The id is monotonic, so a newer tab never reloads back to an old replica
  // while the backend is rolling between two images.
  const buildId = String(Date.now())
  return {
    plugins: [react(), buildIdPlugin(buildId)],
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
      cache: false,
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/i18n-setup.ts'],
    },
  }
})
