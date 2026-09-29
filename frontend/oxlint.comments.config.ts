import { defineConfig } from "oxlint";

// Comment-quality rules only, kept out of oxlint.config.ts on purpose.
//
// The main config is run with --max-warnings=0 over the whole frontend, and the
// existing tree still has several hundred findings from these rules. Enabling
// them there would fail every build until the cleanup lands. So they live here
// and are driven by `task comment-lint`, which scopes findings to the lines a
// branch actually added.
//
// Fold this into oxlint.config.ts once the tree is clean; that is the step that
// also buys IDE squiggles, and the point at which this file goes away.

export default defineConfig({
  jsPlugins: ["../scripts/lint/comment-lint-oxlint-plugin.mjs"],
  categories: { correctness: "off" },
  ignorePatterns: [
    "dist",
    "dist-portal",
    "node_modules",
    "playwright-report",
    "storybook-static",
    "test-results",
    "editor/dist",
    "editor/public",
    "editor/src-tauri",
  ],
  rules: {
    "comments/quality": "error",
  },
});
