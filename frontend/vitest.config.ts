import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/editor/core/setupTests.ts"],
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
        "src/editor/core/setupTests.ts",
        "src/editor/proprietary/setupTests.ts",
        "src/editor/saas/setupTests.ts",
        "**/*.d.ts",
        "src/tests/test-fixtures/**",
        "src/**/*.spec.ts",
      ],
    },
    projects: [
      {
        test: {
          name: "core",
          include: ["src/editor/core/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/core/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.core.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "processor",
          include: ["src/processor/proprietary/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/processor/proprietary/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            // Broad project so @editor/@processor resolve in every editor file the
            // portal tests pull in (core/ui, core, ...).
            projects: ["./tsconfig.processor.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "proprietary",
          include: ["src/editor/proprietary/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/core/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.proprietary.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "desktop",
          include: ["src/editor/desktop/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/core/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.desktop.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "saas",
          // src/editor/saas = editor-saas layer; src/processor/saas = the portal's saas
          // overrides (sibling to src/processor/proprietary). Both build under the saas flavor,
          // so both resolve @processor via the saas cascade (tsconfig.saas.vite.json).
          include: [
            "src/editor/saas/**/*.test.{ts,tsx}",
            "src/processor/saas/**/*.test.{ts,tsx}",
          ],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/saas/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.saas.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "prototypes",
          include: ["src/editor/prototypes/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/core/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.prototypes.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
    ],
  },
  esbuild: {
    target: "es2020",
  },
});
