import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
// oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
import { iconSvgr } from "./scripts/icons/svgrOptions.mts";

// Projects do NOT inherit the root test.testTimeout, so every project silently
// ran at vitest's 5s default. Spread this into each one instead.
const TIMEOUTS = { testTimeout: 10000, hookTimeout: 10000 };

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
    ...TIMEOUTS,
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
          ...TIMEOUTS,
          include: ["src/editor/core/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/core/setupTests.ts"],
        },
        plugins: [
          iconSvgr(),
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
          ...TIMEOUTS,
          include: ["src/processor/proprietary/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/processor/proprietary/setupTests.ts"],
        },
        plugins: [
          iconSvgr(),
          react(),
          tsconfigPaths({
            // Broad project so @app/@portal resolve in every editor file the
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
          ...TIMEOUTS,
          include: ["src/editor/proprietary/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/core/setupTests.ts"],
        },
        plugins: [
          iconSvgr(),
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
          ...TIMEOUTS,
          include: ["src/editor/desktop/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/core/setupTests.ts"],
        },
        plugins: [
          iconSvgr(),
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
          ...TIMEOUTS,
          // src/editor/saas = editor-saas layer; src/processor/saas = the portal's saas
          // overrides (sibling to src/processor/proprietary). Both build under the saas flavor,
          // so both resolve @portal via the saas cascade (tsconfig.saas.vite.json).
          include: [
            "src/editor/saas/**/*.test.{ts,tsx}",
            "src/processor/saas/**/*.test.{ts,tsx}",
          ],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/saas/setupTests.ts"],
        },
        plugins: [
          iconSvgr(),
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
          ...TIMEOUTS,
          include: ["src/editor/prototypes/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/core/setupTests.ts"],
        },
        plugins: [
          iconSvgr(),
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
