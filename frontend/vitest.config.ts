import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
// oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
import { iconSvgr } from "./scripts/icons/svgrOptions.mts";
// oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
import { embedpdfFontFallbackPlugin } from "./scripts/embedpdfFontFallbackPatch.mts";

const frontendPackage: { dependencies: Record<string, string> } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

// Every @mantine/* package, so they share one pre-bundled core: one left
// unbundled imports its own copy and cannot see the bundled MantineProvider.
const MANTINE_PACKAGES = Object.keys(frontendPackage.dependencies).filter(
  (name) => name.startsWith("@mantine/"),
);

// Projects do NOT inherit the root test options, so every project silently ran
// at vitest's 5s default and printed all app stdout. Spread these into each one.
const TEST_DEFAULTS = {
  testTimeout: 10000,
  hookTimeout: 10000,
  // Threads spawn faster for local speed; CI keeps forks so a cross-file global
  // leak can't bleed between files in a shared process.
  pool: process.env.CI ? "forks" : "threads",
  // Mantine is hundreds of small ESM files that every component test re-imports;
  // pre-bundled it is one module (~250ms -> ~25ms of collect per file).
  deps: {
    optimizer: { web: { enabled: true, include: MANTINE_PACKAGES } },
  },
  // All our tests are designed to run in the browser
  testTransformMode: { web: ["**/*"] },
  onConsoleLog(_log: string, type: "stdout" | "stderr") {
    if (type === "stdout" && !process.env.VITEST_CONSOLE) return false;
  },
};

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/editor/core/setupTests.ts"],
    css: false,
    exclude: [
      "node_modules/",
      "src/**/*.spec.ts", // Exclude Playwright E2E tests
      "src/editor/core/tests/test-fixtures/**",
    ],
    ...TEST_DEFAULTS,
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/editor/core/setupTests.ts",
        "src/editor/proprietary/setupTests.ts",
        "src/editor/saas/setupTests.ts",
        "**/*.d.ts",
        "src/editor/core/tests/test-fixtures/**",
        "src/**/*.spec.ts",
      ],
    },
    projects: [
      {
        test: {
          name: "core",
          ...TEST_DEFAULTS,
          include: ["src/editor/core/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/editor/core/setupTests.ts"],
          // Transformed rather than externalized, so the font fallback patch applies.
          server: { deps: { inline: [/@embedpdf\/engines/] } },
        },
        plugins: [
          embedpdfFontFallbackPlugin(),
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
          ...TEST_DEFAULTS,
          include: ["src/processor/proprietary/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/processor/proprietary/setupTests.ts"],
        },
        plugins: [
          iconSvgr(),
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
          ...TEST_DEFAULTS,
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
          ...TEST_DEFAULTS,
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
          ...TEST_DEFAULTS,
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
    ],
  },
  esbuild: {
    target: "es2020",
  },
});
