import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const editorDir = dirname(fileURLToPath(import.meta.url));
const tsconfig = (name: string) => resolve(editorDir, name);

export default defineConfig({
  root: editorDir,
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
        "dist/**",
        "coverage/**",
        "src/core/setupTests.ts",
        "src/portal/setupTests.ts",
        "src/saas/setupTests.ts",
        "**/*.d.ts",
        "src/tests/test-fixtures/**",
        "src/**/*.spec.ts",
      ],
      thresholds: {
        lines: 13,
        functions: 40,
        branches: 63,
        statements: 13,
      },
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
        plugins: [
          react(),
          tsconfigPaths({
            root: editorDir,
            projects: [tsconfig("tsconfig.core.vite.json")],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "portal",
          include: ["src/portal/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/portal/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            root: editorDir,
            // Broad project so @app/@portal resolve in every editor file the
            // portal tests pull in (core/ui, core, ...).
            projects: [tsconfig("tsconfig.portal.vite.json")],
          }),
        ],
        esbuild: {
          target: "es2020",
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
        plugins: [
          react(),
          tsconfigPaths({
            root: editorDir,
            projects: [tsconfig("tsconfig.proprietary.vite.json")],
          }),
        ],
        esbuild: {
          target: "es2020",
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
        plugins: [
          react(),
          tsconfigPaths({
            root: editorDir,
            projects: [tsconfig("tsconfig.desktop.vite.json")],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "saas",
          // src/saas = editor-saas layer; src/portal-saas = the portal's saas
          // overrides (sibling to src/portal). Both build under the saas flavor,
          // so both resolve @portal via the saas cascade (tsconfig.saas.vite.json).
          include: [
            "src/saas/**/*.test.{ts,tsx}",
            "src/portal-saas/**/*.test.{ts,tsx}",
          ],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/saas/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            root: editorDir,
            projects: [tsconfig("tsconfig.saas.vite.json")],
          }),
        ],
        esbuild: {
          target: "es2020",
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
        plugins: [
          react(),
          tsconfigPaths({
            root: editorDir,
            projects: [tsconfig("tsconfig.prototypes.vite.json")],
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
