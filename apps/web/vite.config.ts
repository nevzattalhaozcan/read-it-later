import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Capacitor loads from local fs, needs '/'
  // Vercel needs '/sonra-okurum/'
  base: mode === 'capacitor' ? '/' : '/sonra-okurum/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
}))
