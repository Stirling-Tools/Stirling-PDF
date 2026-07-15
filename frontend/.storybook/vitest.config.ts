import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

/**
 * Dedicated Vitest config that turns every story into a browser test: it mounts
 * the story in real Chromium (render/smoke check) and runs the a11y (axe) rules
 * from addon-a11y as pass/fail. Kept separate from editor/vitest.config.ts (the
 * jsdom unit tests) so the two suites don't collide.
 *
 * The storybook test must live in a `test.projects[]` entry (not a flat config)
 * so Vitest wires up the browser test runner correctly.
 *
 * Run with: npx vitest run --config .storybook/vitest.config.ts
 */
export default defineConfig({
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
