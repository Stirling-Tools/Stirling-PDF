import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
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
        'src/setupTests.ts',
        '**/*.d.ts',
        'src/tests/test-fixtures/**',
        'src/**/*.spec.ts' // Exclude Playwright files from coverage
      ]
    }
  },
  esbuild: {
    target: 'es2020' // Use older target to avoid warnings
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})