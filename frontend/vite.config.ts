import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
   // prevent vite from obscuring rust errors
  // clearScreen: false,
  // // Env variables starting with the item of `envPrefix` will be exposed in tauri's source code through `import.meta.env`.
  // envPrefix: ['VITE_', 'TAURI_ENV_*'],
  // build: {
  //   // Tauri uses Chromium on Windows and WebKit on macOS and Linux
  //   target:
  //     process.env.TAURI_ENV_PLATFORM == 'windows'
  //       ? 'chrome105'
  //       : 'safari13',
  //   // don't minify for debug builds
  //   minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
  //   // produce sourcemaps for debug builds
  //   sourcemap: !!process.env.TAURI_ENV_DEBUG,
  // },
  plugins: [react()],
  server: {
    // make sure this port matches the devUrl port in tauri.conf.json file
    port: 5173,
    // Tauri expects a fixed port, fail if that port is not available
    strictPort: true,
    watch: {
      // tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});