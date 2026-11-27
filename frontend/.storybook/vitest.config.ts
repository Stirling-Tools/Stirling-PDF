import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
// oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
import { brokenInFlavorTag, flavorBuild, notInFlavorTag } from "./flavor";

/**
 * Dedicated Vitest config that turns every story into a browser test: it mounts
 * the story in real Chromium and runs axe against it, so a story fails if it
 * throws on mount or trips an accessibility rule. Kept separate from
 * vitest.config.ts (the jsdom unit tests) so the two suites don't collide.
 *
 * The storybook test must live in a `test.projects[]` entry (not a flat config)
 * so Vitest wires up the browser test runner correctly.
 *
 * Run with: npx vitest run --config .storybook/vitest.config.ts
 */
export default defineConfig({
  // Forwards the SCAN_THEME env var into the browser bundle, where preview.tsx
  // uses it to pin the theme global for the whole run. The Storybook dev/build
  // pipeline never sets it, so the toolbar default stays "light" there.
  define: {
    "import.meta.env.VITE_SCAN_THEME": JSON.stringify(
      process.env.SCAN_THEME ?? "",
    ),
  },
  optimizeDeps: {
    // Pre-scan the selected flavour's stories + the preview so Vite discovers
    // the story set's large dep surface (embedpdf plugins, lucide svgs, …) in
    // one pass up front. One unresolvable import fails the whole scan, so
    // another flavour's stories must stay out of it.
    entries: [
      ...flavorBuild.stories.filter((glob) => !glob.endsWith(".mdx")),
      ".storybook/preview.tsx",
    ],
    // `entries` alone does not catch deps reached through a transformed JSX
    // runtime import, nor the preview's own dependency graph (the test plugin
    // injects the preview in a way the entry scanner doesn't crawl). Vite then
    // optimizes them lazily mid-run and emits "optimized dependencies changed,
    // reloading" — the reload tears down the browser worker and whichever
    // stories were mid-load fail with a bogus "Failed to fetch dynamically
    // imported module" that reads like a real crash. Only a cold dep cache
    // hits this, which is every CI run. Naming them keeps a run deterministic.
    include: [
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom",
      "react-dom/client",
      "@storybook/react-vite",
      "@storybook/addon-a11y/preview",
      "@storybook/addon-themes",
      "msw-storybook-addon",
      "react-router-dom",
      "@tanstack/react-query",
      "i18next",
      "react-i18next",
      "smol-toml",
      "@mantine/core",
      "@supabase/supabase-js",
      "axios",
      // Reached through dynamic imports the entry scan does not follow, in at
      // least one setup's build.
      "posthog-js",
      "react-rnd",
      "@reactour/tour",
      "@mantine/dates",
      "@userback/widget",
      "@tauri-apps/api/mocks",
      "@tauri-apps/api/app",
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        // Reads .storybook/main.ts (stories glob + viteFinal aliases) so every
        // discovered story becomes a test with the app's real module resolution.
        plugins: [
          storybookTest({
            configDir: resolve(__dirname),
            tags: { exclude: [notInFlavorTag], skip: [brokenInFlavorTag] },
          }),
        ],
        test: {
          name: "storybook",
          // Mounting a story and running a full axe pass over it takes well
          // over Vitest's 5s default on the heavier screens, and a story that
          // trips the timeout is reported as a failure with no message — which
          // reads like a crash and makes the run non-reproducible. Give it
          // room; a genuinely hung story still fails, just later.
          testTimeout: 60_000,
          hookTimeout: 60_000,
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
