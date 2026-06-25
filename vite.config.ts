/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dev: browser calls same-origin /api/*, Vite proxies to the MeetPR backend.
// Sidesteps CORS + mixed-content. Edit here to point at a local backend.
const API_TARGET = 'http://121.40.160.241:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
