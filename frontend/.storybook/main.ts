import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";
import type { Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
// oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
import { iconSvgr } from "../scripts/icons/svgrOptions.mts";
// By path, not @editor/*: this file runs in node, before the aliases exist.
// oxlint-disable-next-line no-restricted-imports -- config runs before aliases exist
import { usedIconsPlugin } from "../scripts/icons/usedIcons.vite.mts";
// oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
import { flavor, flavorBuild, notInFlavorTag } from "./flavor";

/** Swaps the preview's per-build setup module for the desktop one. */
function desktopFlavorSetup(): Plugin {
  return {
    name: "storybook-desktop-flavor-setup",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "./flavorSetup" && importer?.includes("/.storybook/"))
        return resolve(__dirname, "flavorSetup.desktop.ts");
      return null;
    },
  };
}

/**
 * Resolves `@processor/*` through the flavour's processor layers, first match
 * wins. A plain alias can name one directory only, so a module that exists in
 * a higher layer alone (desktop's `edition`) would not resolve. Runs before the
 * tsconfig resolver so `.storybook/` files, which no tsconfig project covers,
 * share one module instance with the stories.
 */
function processorCascade(): Plugin {
  const layers = flavorBuild.processorLayers.map((layer) =>
    resolve(__dirname, "..", layer),
  );
  return {
    name: "storybook-processor-cascade",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.startsWith("@processor/")) return null;
      const rest = source.slice("@processor".length);
      for (const layer of layers) {
        const resolved = await this.resolve(layer + rest, importer, {
          ...options,
          skipSelf: true,
        });
        if (resolved) return resolved;
      }
      return null;
    },
  };
}

/** Built per pass: the main bundle and the worker bundle each need their own. */
const editorPathAliases = () =>
  tsconfigPaths({
    projects: flavorBuild.projects.map((project) =>
      resolve(__dirname, "..", project),
    ),
  });

/**
 * Storybook 9 ships essentials, interactions, and docs as built-ins, so the
 * addon list is just the extras we want: theme switching + a11y auditing.
 *
 * Story files live next to their components under src/editor/ (which includes
 * the portal layer at src/processor/proprietary/). MDX docs pages live in
 * src/processor/proprietary/docs/.
 */
const config: StorybookConfig = {
  stories: flavorBuild.stories.map((glob) => `../${glob}`),
  tags: { [notInFlavorTag]: { excludeFromSidebar: true } },
  addons: [
    "@storybook/addon-themes",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // Read by manager.ts to name the build beside the sidebar's title.
  managerHead: (head) =>
    `${head ?? ""}<script>window.STORYBOOK_FLAVOR = ${JSON.stringify(flavor)};</script>`,
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
  // Serve the MSW worker file from the portal's public dir so Storybook can
  // intercept network calls the same way the dev portal does.
  staticDirs: ["../public"],
  viteFinal: async (config) => {
    // The auto-loaded app config's default publicDir is the same public/ that
    // staticDirs copies.
    config.publicDir = false;
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@editor/services/supabaseClient": resolve(
        __dirname,
        "billingSupabaseClient.ts",
      ),
      ...(flavor === "desktop" && {
        "@tauri-apps/plugin-http": resolve(__dirname, "tauriHttp.ts"),
      }),
      // Direct layer aliases so .storybook config files (preview.tsx), which sit
      // outside src/ and so aren't covered by tsconfigPaths, can import layer
      // modules (e.g. the auth supabase client that moved into proprietary).
      "@editor-proprietary": resolve(__dirname, "../src/editor/proprietary"),
      "@editor-core": resolve(__dirname, "../src/editor/core"),
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
    // The app config's own resolver reads the default build's tsconfig and runs
    // before ours, so it would resolve `@editor/*` through the wrong cascade.
    config.plugins = config.plugins.filter(
      (p) =>
        !(
          p &&
          typeof p === "object" &&
          "name" in p &&
          p.name === "vite-tsconfig-paths"
        ),
    );
    config.plugins.push(iconSvgr());
    config.plugins.push(processorCascade());
    config.plugins.push(editorPathAliases());
    if (flavor === "desktop") config.plugins.push(desktopFlavorSetup());
    // Scanned at startup rather than committed, so the gallery's "in use" view cannot go stale.
    config.plugins.push(usedIconsPlugin(resolve(__dirname, "../src")));
    // Worker bundles are a separate Rollup pass and do NOT inherit `plugins`, so
    // without this a worker importing @editor/* fails to resolve while the same
    // import works everywhere else. Mirrors editor/vite.config.ts.
    config.worker = {
      ...(config.worker ?? {}),
      plugins: () => [processorCascade(), editorPathAliases()],
    };
    // Point apiClient.saas at a mock origin so the SaaS-backed billing stories
    // (SubscribedPlanView, PaymentMethodCard, InvoicesList) resolve a base URL and
    // their MSW handlers (which match "*/api/v1/payg/...") can intercept. The host
    // never receives a real request — MSW answers first. Injected here, next to the
    // MSW setup, rather than via a frontend/.env so no stray env file can leak into a
    // real portal/editor build (those load env from their own roots).
    config.define = {
      ...(config.define ?? {}),
      // Read by preview.tsx for the flavour's own runtime setup (desktop's IPC mock).
      "import.meta.env.STORYBOOK_FLAVOR": JSON.stringify(flavor),
      "import.meta.env.VITE_SAAS_API_URL": JSON.stringify("http://saas.mock"),
      // Empty outside SaaS so ensureSaasSupabase() is a no-op and never replaces
      // the mock SaaS client stubbed in preview.tsx. The SaaS build's own client
      // refuses to load without both, so it gets the mock origin MSW answers.
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        flavor === "saas" ? "http://saas.mock" : "",
      ),
      // Desktop's own client reads the key too, with its URL below; the empty
      // VITE_SUPABASE_URL still keeps ensureSaasSupabase() a no-op there.
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY": JSON.stringify(
        flavor === "saas" || flavor === "desktop" ? "storybook-anon-key" : "",
      ),
      // Desktop creates its Supabase client on import and throws without a URL.
      ...(flavor === "desktop" && {
        "import.meta.env.VITE_SAAS_SERVER_URL":
          JSON.stringify("http://saas.mock"),
      }),
      // No story can reach Stripe: with a key, a checkout story would load
      // Stripe's real embedded checkout and hand it a made-up client secret.
      "import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY": JSON.stringify(""),
    };
    return config;
  },
};

export default config;
