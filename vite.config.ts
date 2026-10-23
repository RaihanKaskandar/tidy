import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Fail instead of quietly moving to another port when a dev server is already running.
    strictPort: true,
    proxy: { '/api': 'http://localhost:3001', '/eink': 'http://localhost:3001' },
  },
})
