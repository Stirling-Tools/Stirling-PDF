import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

// When DISABLE_ADDITIONAL_FEATURES is false (or unset), enable proprietary features
const isProprietary = process.env.DISABLE_ADDITIONAL_FEATURES !== 'true';

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [
        isProprietary ? './tsconfig.proprietary.json' : './tsconfig.core.json',
      ],
    }),
  ],
  server: {
    host: true, // Listen on all addresses (0.0.0.0) - allows access from any domain/IP
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/oauth2': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/login/oauth2': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  base: process.env.RUN_SUBPATH ? `/${process.env.RUN_SUBPATH}` : './',
});
