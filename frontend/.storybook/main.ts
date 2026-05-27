import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook 9 ships essentials, interactions, and docs as built-ins, so the
 * addon list is just the extras we want: theme switching + a11y auditing.
 *
 * Story files live next to their components in shared/ and portal/src/.
 * MDX docs pages live in portal/src/docs/.
 */
const config: StorybookConfig = {
  stories: [
    "../portal/src/**/*.mdx",
    "../portal/src/**/*.stories.@(ts|tsx)",
    "../shared/**/*.mdx",
    "../shared/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-themes", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
  // Serve the MSW worker file from portal/public so Storybook can intercept
  // network calls the same way the dev portal does.
  staticDirs: ["../portal/public"],
  viteFinal: async (config) => {
    // Wire @portal/* and @shared/* aliases directly on the Storybook bundler so
    // story imports resolve without needing the portal's vite config.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@portal": resolve(__dirname, "../portal/src"),
      "@shared": resolve(__dirname, "../shared"),
    };
    return config;
  },
};

export default config;
