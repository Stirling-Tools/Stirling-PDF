import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Storybook 9 ships essentials, interactions, and docs as built-ins, so the
 * addon list is just the extras we want: theme switching + a11y auditing.
 *
 * Story files live next to their components in shared/, portal/src/, and
 * editor/src/ — the design system is shared by BOTH apps, so both surface
 * their stories here. MDX docs pages live in portal/src/docs/.
 */
const config: StorybookConfig = {
  stories: [
    "../portal/src/**/*.mdx",
    "../portal/src/**/*.stories.@(ts|tsx)",
    "../shared/**/*.mdx",
    "../shared/**/*.stories.@(ts|tsx)",
    "../editor/src/**/*.stories.@(ts|tsx)",
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
    // portal story imports resolve without needing the portal's vite config.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@portal": resolve(__dirname, "../portal/src"),
      "@shared": resolve(__dirname, "../shared"),
    };
    // Editor stories import via @app/* (proprietary→core fallback), @core/* and
    // @proprietary/*. Resolve them exactly the way the editor's own build does —
    // through vite-tsconfig-paths against the proprietary vite tsconfig — so the
    // shared Storybook can host editor components without duplicating the alias
    // map here.
    config.plugins = config.plugins ?? [];
    config.plugins.push(
      tsconfigPaths({
        projects: [
          resolve(__dirname, "../editor/tsconfig.proprietary.vite.json"),
        ],
      }),
    );
    // Point apiClient.saas at a mock origin so the SaaS-backed billing stories
    // (SubscribedPlanView, PaymentMethodCard, InvoicesList) resolve a base URL and
    // their MSW handlers (which match "*/api/v1/payg/...") can intercept. The host
    // never receives a real request — MSW answers first. Injected here, next to the
    // MSW setup, rather than via a frontend/.env so no stray env file can leak into a
    // real portal/editor build (those load env from their own roots).
    config.define = {
      ...(config.define ?? {}),
      "import.meta.env.VITE_SAAS_API_URL": JSON.stringify("http://saas.mock"),
    };
    return config;
  },
};

export default config;
