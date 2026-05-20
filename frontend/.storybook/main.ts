import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";

// Tell vite.config.ts to skip the editor's viteStaticCopy plugin (PDF assets,
// fonts, locales — 188 items we don't need). Set before any Storybook import
// triggers config evaluation.
process.env.STIRLING_STORYBOOK = "true";

/**
 * Storybook 9 ships essentials, interactions, and docs as built-ins, so the
 * addon list is just the extras we want: theme switching + a11y auditing.
 *
 * Story files live next to their components in src/shared/ and src/portal/.
 * MDX docs pages live in src/portal/docs/.
 */
const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-themes", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
  // Serve the MSW worker file from portal/public so storybook can intercept
  // network calls the same way the dev portal does.
  staticDirs: ["../portal/public"],
  viteFinal: async (config) => {
    // Storybook resolves @app/* and @shared/* via explicit aliases here rather
    // than via the per-mode tsconfig.*.vite.json — Storybook doesn't honour
    // the --mode flag the way our vite.config.ts expects, so the safer path is
    // to wire the aliases the storybook bundler actually uses.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@app": resolve(__dirname, "../src/portal"),
      "@shared": resolve(__dirname, "../src/shared"),
    };
    // Strip the editor's viteStaticCopy plugin — it pulls 188 PDF/locale
    // assets that the portal-and-design-system Storybook doesn't need.
    if (Array.isArray(config.plugins)) {
      config.plugins = config.plugins.filter((p) => {
        if (!p || typeof p !== "object" || Array.isArray(p)) return true;
        const name = (p as { name?: string }).name;
        return name !== "vite-plugin-static-copy";
      });
    }
    return config;
  },
};

export default config;
