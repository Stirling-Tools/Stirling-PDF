import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";
import tsconfigPaths from "vite-tsconfig-paths";
// oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
import { iconSvgr } from "../scripts/icons/svgrOptions.mts";
// By path, not @app/*: this file runs in node, before the aliases exist.
// oxlint-disable-next-line no-restricted-imports -- config runs before aliases exist
import { legacyIconsPlugin } from "../scripts/icons/legacyIcons.vite.mts";
// oxlint-disable-next-line no-restricted-imports -- config runs before aliases exist
import { usedIconsPlugin } from "../scripts/icons/usedIcons.vite.mts";

/**
 * Storybook 9 ships essentials, interactions, and docs as built-ins, so the
 * addon list is just the extras we want: theme switching + a11y auditing.
 *
 * Story files live next to their components under src/editor/ (which includes
 * the portal layer at src/processor/proprietary/). MDX docs pages live in
 * src/processor/proprietary/docs/.
 */
/**
 * Editor stories import via `@app/*` (proprietary→core fallback), `@core/*` and
 * `@proprietary/*`. Resolve them exactly the way the editor's own build does -
 * through vite-tsconfig-paths against the proprietary vite tsconfig - so the
 * shared Storybook can host editor components without duplicating the alias map
 * here. Built per pass: the main bundle and the worker bundle each need their own.
 *
 * The plugin picks the first project whose include/exclude covers the importing
 * file. The proprietary project excludes src/desktop and src/cloud, so both fall
 * through to the desktop project and get the desktop→cloud→proprietary→core
 * cascade their own imports need; every other file still resolves as before.
 */
const editorPathAliases = () =>
  tsconfigPaths({
    projects: [
      resolve(__dirname, "../tsconfig.proprietary.vite.json"),
      resolve(__dirname, "../tsconfig.desktop.vite.json"),
    ],
  });

const config: StorybookConfig = {
  stories: [
    "../src/processor/proprietary/**/*.mdx",
    "../src/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    "@storybook/addon-themes",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
  // Serve the MSW worker file from the portal's public dir so Storybook can
  // intercept network calls the same way the dev portal does.
  staticDirs: ["../public"],
  viteFinal: async (config) => {
    // Wire the @portal/* alias directly on the Storybook bundler so portal
    // story imports resolve without needing the portal's vite config.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@app/services/supabaseClient": resolve(
        __dirname,
        "billingSupabaseClient.ts",
      ),
      "@portal": resolve(__dirname, "../src/processor/proprietary"),
      // Direct layer aliases so .storybook config files (preview.tsx), which sit
      // outside src/ and so aren't covered by tsconfigPaths, can import layer
      // modules (e.g. the auth supabase client that moved into proprietary).
      "@proprietary": resolve(__dirname, "../src/editor/proprietary"),
      "@core": resolve(__dirname, "../src/editor/core"),
      // Public assets (e.g. the en-US translation TOML loaded ?raw by preview.tsx).
      // No src alias covers public/, so this lets the config use an alias rather
      // than a relative path.
      "@public": resolve(__dirname, "../public"),
    };
    config.plugins = config.plugins ?? [];
    // Storybook's builder-vite auto-loads the app's vite.config.ts and merges in
    // its plugins, but a Storybook build is not an app build. Drop the app's
    // build-only plugins that emit deploy artifacts against a dist/ that a
    // Storybook build never produces (prerender-og would otherwise throw ENOENT).
    const APP_BUILD_ONLY = new Set(["prerender-og", "compress-static-copy"]);
    config.plugins = config.plugins.filter((p) => {
      const name =
        p && typeof p === "object" && "name" in p
          ? (p as { name?: unknown }).name
          : undefined;
      return typeof name !== "string" || !APP_BUILD_ONLY.has(name);
    });
    config.plugins.push(iconSvgr());
    config.plugins.push(editorPathAliases());
    // Reads the audit's "before" glyphs from the icon packages, so none of their artwork is checked in.
    config.plugins.push(legacyIconsPlugin(resolve(__dirname, "..")));
    // Scanned at startup rather than committed, so the gallery's "in use" view cannot go stale.
    config.plugins.push(usedIconsPlugin(resolve(__dirname, "../src")));
    // Worker bundles are a separate Rollup pass and do NOT inherit `plugins`, so
    // without this a worker importing @app/* fails to resolve while the same
    // import works everywhere else. Mirrors editor/vite.config.ts.
    config.worker = {
      ...(config.worker ?? {}),
      plugins: () => [editorPathAliases()],
    };
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
