import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Storybook 9 ships essentials, interactions, and docs as built-ins, so the
 * addon list is just the extras we want: theme switching + a11y auditing.
 *
 * Story files live next to their components under editor/src/ (which includes
 * the portal layer at editor/src/portal/). MDX docs pages live in
 * editor/src/portal/docs/.
 */
const config: StorybookConfig = {
  stories: [
    "../editor/src/portal/**/*.mdx",
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
  // Serve the MSW worker file from the portal's public dir so Storybook can
  // intercept network calls the same way the dev portal does.
  staticDirs: ["../editor/public"],
  viteFinal: async (config) => {
    // Wire the @portal/* alias directly on the Storybook bundler so portal
    // story imports resolve without needing the portal's vite config.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@portal": resolve(__dirname, "../editor/src/portal"),
      // Direct layer aliases so .storybook config files (preview.tsx), which sit
      // outside src/ and so aren't covered by tsconfigPaths, can import layer
      // modules (e.g. the auth supabase client that moved into proprietary).
      "@proprietary": resolve(__dirname, "../editor/src/proprietary"),
      "@core": resolve(__dirname, "../editor/src/core"),
      // Public assets (e.g. the en-US translation TOML loaded ?raw by preview.tsx).
      // No src alias covers public/, so this lets the config use an alias rather
      // than a relative path.
      "@public": resolve(__dirname, "../editor/public"),
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
      // Keep the Supabase auth env empty so ensureSaasSupabase() is a no-op and
      // never replaces the mock SaaS client stubbed in preview.tsx.
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY":
        JSON.stringify(""),
    };
    return config;
  },
};

export default config;
