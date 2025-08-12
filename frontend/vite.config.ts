import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow access from any IP
    port: 5173,
    allowedHosts: ['pdf2.froodleplex.com', 'localhost', '.local'], // Add your domain
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
    // Handle SPA routing - serve index.html for all routes
    historyApiFallback: true,
  },
});
