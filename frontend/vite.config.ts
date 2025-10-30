import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  // When DISABLE_ADDITIONAL_FEATURES is false (or unset), enable proprietary features
  const isProprietary = process.env.DISABLE_ADDITIONAL_FEATURES !== 'true';
  const isDesktopMode =
    mode === 'desktop' ||
    process.env.STIRLING_DESKTOP === 'true' ||
    process.env.VITE_DESKTOP === 'true';

  const baseProject = isProprietary ? './src/proprietary/tsconfig.json' : './src/core/tsconfig.json';
  const desktopProject = isProprietary ? './src/desktop/tsconfig.json' : baseProject;
  const tsconfigProject = isDesktopMode ? desktopProject : baseProject;

  return {
    plugins: [
      react(),
      tsconfigPaths({
        projects: [tsconfigProject],
      }),
    ],
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
  };
});
