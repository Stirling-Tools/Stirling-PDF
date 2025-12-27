import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    allowedHosts: ['ai.froodleplex.com', 'ai-demo.stirling.com'],
    proxy: {
      '/api/v1/ai': {
        target: process.env.DOCKER_ENV ? 'http://backend:8080' : 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})
