import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

/**
 * Dedicated Vitest config that turns every story into a browser test: it mounts
 * the story in real Chromium as a render/smoke check (a story must mount without
 * throwing). a11y is currently report-only (preview's `a11y.test: "todo"`) and is
 * not yet enforced here — flipping it to pass/fail is a follow-up. Kept separate
 * from editor/vitest.config.ts (the jsdom unit tests) so the two suites don't collide.
 *
 * The storybook test must live in a `test.projects[]` entry (not a flat config)
 * so Vitest wires up the browser test runner correctly.
 *
 * Run with: npx vitest run --config .storybook/vitest.config.ts
 */
export default defineConfig({
  // Pre-scan every story + the preview up front so Vite discovers and bundles
  // ALL deps in a single optimize pass. Without this, the huge dep surface of
  // the story set (embedpdf plugins, @mui icons, etc.) is discovered lazily
  // mid-run, triggering "optimized dependencies changed, reloading" which tears
  // down browser test workers and spuriously fails whichever stories were loading.
  optimizeDeps: {
    entries: ["editor/src/**/*.stories.@(ts|tsx)", ".storybook/preview.tsx"],
  },
  test: {
    projects: [
      {
        extends: true,
        // Reads .storybook/main.ts (stories glob + viteFinal aliases) so every
        // discovered story becomes a test with the app's real module resolution.
        plugins: [storybookTest({ configDir: resolve(__dirname) })],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: "playwright",
            instances: [{ browser: "chromium" }],
          },
          setupFiles: [resolve(__dirname, "vitest.setup.ts")],
        },
      },
    ],
  },
});
