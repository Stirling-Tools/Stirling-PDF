import { resolve } from "node:path";
import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteStaticCopy } from "vite-plugin-static-copy";

const VALID_MODES = [
  "core",
  "proprietary",
  "saas",
  "desktop",
  "prototypes",
  "portal",
] as const;
type BuildMode = (typeof VALID_MODES)[number];

const TSCONFIG_MAP: Record<BuildMode, string> = {
  core: "./tsconfig.core.vite.json",
  proprietary: "./tsconfig.proprietary.vite.json",
  saas: "./tsconfig.saas.vite.json",
  desktop: "./tsconfig.desktop.vite.json",
  prototypes: "./tsconfig.prototypes.vite.json",
  portal: "./tsconfig.portal.vite.json",
};

export default defineConfig(async ({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the
  // `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), "");

  // Resolve the effective build mode.
  // Explicit --mode flags take precedence; otherwise default to proprietary
  // unless DISABLE_ADDITIONAL_FEATURES=true, in which case default to core.
  const effectiveMode: BuildMode = (VALID_MODES as readonly string[]).includes(
    mode,
  )
    ? (mode as BuildMode)
    : process.env.DISABLE_ADDITIONAL_FEATURES === "true"
      ? "core"
      : "proprietary";

  // Resolve to an absolute path because the portal mode shifts Vite's root,
  // and tsconfig-paths would otherwise look for ./tsconfig.portal.vite.json
  // relative to the new root (frontend/portal/) instead of frontend/.
  const tsconfigProject = resolve(__dirname, TSCONFIG_MAP[effectiveMode]);

  // Backend proxy target: default localhost:8080. Override via BACKEND_URL env var
  // so the top-level dev launcher can wire a dynamically-assigned backend port.
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
  const backendProxy = {
    target: backendUrl,
    changeOrigin: true,
    secure: false,
    xfwd: true,
  };

  const isPortal = effectiveMode === "portal";
  // Storybook sets this env var in .storybook/main.ts before loading us. When
  // it's set we treat the build as a portal build for asset-copying purposes.
  const isStorybook = process.env.STIRLING_STORYBOOK === "true";
  const skipEditorAssets = isPortal || isStorybook;

  return {
    plugins: [
      react(),
      tsconfigPaths({
        projects: [tsconfigProject],
      }),
      // Set ANALYZE=true to emit dist/stats.html (treemap) alongside the
      // build; rollup-plugin-visualizer is ESM-only so we import dynamically.
      ...(process.env.ANALYZE === "true"
        ? [
            (await import("rollup-plugin-visualizer")).visualizer({
              filename: "dist/stats.html",
              template: "treemap",
              gzipSize: true,
              brotliSize: true,
              emitFile: false,
            }) as PluginOption,
          ]
        : []),
      // Editor-only static asset copies (pdfium, pdfjs, jscanify). The portal
      // does not render PDFs, so we skip these when building portal mode (or
      // Storybook) to keep the bundle lean.
      ...(skipEditorAssets
        ? []
        : [
            viteStaticCopy({
              targets: [
                {
                  //provides static pdfium so embedpdf can run without cdn
                  src: "node_modules/@embedpdf/pdfium/dist/pdfium.wasm",
                  dest: "pdfium",
                },
                {
                  // Copy jscanify vendor files to dist
                  src: "public/vendor/jscanify/*",
                  dest: "vendor/jscanify",
                },
                {
                  // pdfjs-dist CMap data for CJK / non-latin glyph mapping — required
                  // when rendering PDFs inside workers where the default DOM fetch paths
                  // aren't available.
                  src: "node_modules/pdfjs-dist/cmaps/*",
                  dest: "pdfjs/cmaps",
                },
                {
                  // pdfjs-dist standard font data (Helvetica/Times/etc.) — needed so
                  // workers can substitute non-embedded base 14 fonts without DOM access.
                  src: "node_modules/pdfjs-dist/standard_fonts/*",
                  dest: "pdfjs/standard_fonts",
                },
              ],
            }),
          ]),
    ],
    server: {
      host: true,
      // make sure this port matches the devUrl port in tauri.conf.json file
      port: 5173,
      // Tauri expects a fixed port, fail if that port is not available
      strictPort: true,
      watch: {
        // tell vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
      // Portal mode's root is frontend/portal/. Its entry (portal/main.tsx)
      // imports @app/* and @shared/* which resolve to files under frontend/src/.
      // Without an explicit fs.allow Vite would reject those reads as "outside
      // the project root."
      fs: isPortal ? { allow: [resolve(__dirname)] } : undefined,
      // The desktop build talks to the backend directly via Tauri; the portal
      // is not wired to a backend yet (no API surface). Everything else proxies
      // the editor's backend on :8080.
      proxy:
        effectiveMode === "desktop" || isPortal
          ? undefined
          : {
              "/api": backendProxy,
              "/oauth2": backendProxy,
              "/saml2": backendProxy,
              "/login/oauth2": backendProxy,
              "/login/saml2": backendProxy,
              "/swagger-ui": backendProxy,
              "/v1/api-docs": backendProxy,
            },
    },
    // The portal is rooted at frontend/portal/ so its dev URL is just `/`
    // and the build emits an index.html instead of a portal.html. The editor's
    // public/ holds PDF assets, locales, and login imagery — none of which
    // the portal needs, so we skip the publicDir copy too.
    ...(isPortal
      ? {
          root: "portal",
          // public/ inside portal/ ships the MSW service worker (and any other
          // portal-only static assets) — but does NOT pull in the editor's
          // public/ which holds PDF assets, locales, and login imagery.
          publicDir: "public",
          build: {
            // Relative to root, so this lands at frontend/dist-portal/ — outside
            // the portal/ directory and parallel to the editor's dist/.
            outDir: "../dist-portal",
            emptyOutDir: true,
          },
        }
      : {}),
    base: env.RUN_SUBPATH ? `/${env.RUN_SUBPATH}` : "./",
  };
});
