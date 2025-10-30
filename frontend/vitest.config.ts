import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

// When DISABLE_ADDITIONAL_FEATURES is false (or unset), enable proprietary features
const isProprietary = process.env.DISABLE_ADDITIONAL_FEATURES !== 'true';

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [
        isProprietary ? './src/proprietary/tsconfig.json' : './src/core/tsconfig.json',
      ],
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/core/setupTests.ts'],
    css: false, // Disable CSS processing to speed up tests
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    exclude: [
      'node_modules/',
      'src/**/*.spec.ts', // Exclude Playwright E2E tests
      'src/tests/test-fixtures/**'
    ],
    testTimeout: 10000, // 10 second timeout
    hookTimeout: 10000, // 10 second timeout for setup/teardown
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/core/setupTests.ts',
        '**/*.d.ts',
        'src/tests/test-fixtures/**',
        'src/**/*.spec.ts' // Exclude Playwright files from coverage
      ]
    }
  },
  esbuild: {
    target: 'es2020' // Use older target to avoid warnings
  }
});
