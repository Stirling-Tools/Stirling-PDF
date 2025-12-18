import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/core/setupTests.ts'],
    css: false,
    exclude: [
      'node_modules/',
      'src/**/*.spec.ts', // Exclude Playwright E2E tests
      'src/tests/test-fixtures/**',
      'src/assets/**' // Exclude generated icon files
    ],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/core/setupTests.ts',
        '**/*.d.ts',
        'src/tests/test-fixtures/**',
        'src/**/*.spec.ts',
        'src/assets/**' // Exclude generated icon files
      ]
    },
    projects: [
      {
        test: {
          name: 'core',
          include: ['src/core/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/core/setupTests.ts'],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ['./tsconfig.core.json'],
          }),
        ],
        esbuild: {
          target: 'es2020'
        }
      },
      {
        test: {
          name: 'proprietary',
          include: ['src/proprietary/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/core/setupTests.ts'],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ['./tsconfig.proprietary.json'],
          }),
        ],
        esbuild: {
          target: 'es2020'
        }
      },
      {
        test: {
          name: 'desktop',
          include: ['src/desktop/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/core/setupTests.ts'],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ['./tsconfig.desktop.json'],
          }),
        ],
        esbuild: {
          target: 'es2020'
        }
      },
    ],
  },
  esbuild: {
    target: 'es2020'
  }
});
