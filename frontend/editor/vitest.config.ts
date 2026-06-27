import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Global @shared alias so SUI components (and their own `@shared/*` self-imports,
// which live outside the editor tsconfig scope) resolve under test — mirrors the
// resolve.alias in vite.config.ts.
const sharedDir = path.resolve(__dirname, "../shared");

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/core/setupTests.ts"],
    css: false,
    exclude: [
      "node_modules/",
      "src/**/*.spec.ts", // Exclude Playwright E2E tests
      "src/tests/test-fixtures/**",
    ],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/core/setupTests.ts",
        "src/proprietary/setupTests.ts",
        "src/saas/setupTests.ts",
        "**/*.d.ts",
        "src/tests/test-fixtures/**",
        "src/**/*.spec.ts",
      ],
    },
    projects: [
      {
        test: {
          name: "core",
          include: ["src/core/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/core/setupTests.ts"],
        },
        plugins: [react()],
        resolve: {
          tsconfigPaths: true,
          alias: { "@shared": sharedDir },
        },
      },
      {
        test: {
          name: "proprietary",
          include: ["src/proprietary/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/core/setupTests.ts"],
        },
        plugins: [react()],
        resolve: {
          tsconfigPaths: true,
          alias: { "@shared": sharedDir },
        },
      },
      {
        test: {
          name: "desktop",
          include: ["src/desktop/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/core/setupTests.ts"],
        },
        plugins: [react()],
        resolve: {
          tsconfigPaths: true,
          alias: { "@shared": sharedDir },
        },
      },
      {
        test: {
          name: "saas",
          include: ["src/saas/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/saas/setupTests.ts"],
        },
        plugins: [react()],
        resolve: {
          tsconfigPaths: true,
          alias: { "@shared": sharedDir },
        },
      },
      {
        test: {
          name: "prototypes",
          include: ["src/prototypes/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/core/setupTests.ts"],
        },
        plugins: [react()],
        resolve: {
          tsconfigPaths: true,
          alias: { "@shared": sharedDir },
        },
      },
    ],
  },
});
