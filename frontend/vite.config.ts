import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => {
  // When DISABLE_ADDITIONAL_FEATURES is false (or unset), enable proprietary features
  const isProprietary = process.env.DISABLE_ADDITIONAL_FEATURES !== 'true';
  const isDesktopMode =
    mode === 'desktop' ||
    process.env.STIRLING_DESKTOP === 'true' ||
    process.env.VITE_DESKTOP === 'true';

  const baseProject = isProprietary ? './tsconfig.proprietary.json' : './tsconfig.core.json';
  const desktopProject = isProprietary ? './tsconfig.desktop.json' : baseProject;
  const tsconfigProject = isDesktopMode ? desktopProject : baseProject;

  return {
    plugins: [
    visualizer({
      open: true,
      filename: "stats.html"
    }),
      react(),
      tsconfigPaths({
        projects: [tsconfigProject],
      }),
      viteStaticCopy({
        targets: [
          {
            //provides static pdfium so embedpdf can run without cdn
            src: 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
            dest: 'pdfium'
          }
        ]
      })
    ],
    build: {
      // Increase chunk size warning limit for desktop builds
      // Desktop apps don't have network download concerns
      chunkSizeWarningLimit: isDesktopMode ? 5000 : 500,
      rollupOptions: {
        output: {
          // Manual chunks for better code splitting
          manualChunks: {
            // Large UI libraries
            'vendor-ui': ['@mantine/core', '@mantine/hooks', '@mantine/dates', '@mantine/dropzone'],
            // React and related
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // Other large dependencies
            'vendor-utils': ['jszip'],
          },
        },
      },
    },
    server: {
      host: true,
      // make sure this port matches the devUrl port in tauri.conf.json file
      port: 5173,
      // Tauri expects a fixed port, fail if that port is not available
      strictPort: true,
      watch: {
        // tell vite to ignore watching `src-tauri`
        ignored: ['**/src-tauri/**'],
      },
      // Only use proxy in web mode - Tauri handles backend connections directly
      proxy: isDesktopMode ? undefined : {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          xfwd: true,
        },
        '/oauth2': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          xfwd: true,
        },
        '/saml2': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          xfwd: true,
        },
        '/login/oauth2': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          xfwd: true,
        },
        '/login/saml2': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          xfwd: true,
        },
        '/swagger-ui': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          xfwd: true,
        },
        '/v1/api-docs': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          xfwd: true,
        },
      },
    },
    base: process.env.RUN_SUBPATH ? `/${process.env.RUN_SUBPATH}` : './',
  };
});
