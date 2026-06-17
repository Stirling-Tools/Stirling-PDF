import react from "@vitejs/plugin-react-swc";
import { compression, defineAlgorithm } from "vite-plugin-compression2";
import fs from "node:fs/promises";
import path, { resolve } from "node:path";
import { constants, brotliCompress, gzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { defineConfig, loadEnv } from "vite";
import type { PluginOption } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteStaticCopy } from "vite-plugin-static-copy";

const gzipPromise = promisify(gzip);
const brotliPromise = promisify(brotliCompress);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function compressStaticCopyPlugin(): PluginOption {
  return {
    name: "compress-static-copy",
    apply: "build" as const,
    async closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      const targets = ["pdfium", "vendor", "pdfjs"];

      const excludedExtensions = [
        ".gz",
        ".br",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".woff",
        ".woff2",
      ];

      async function walkAndCompress(dirOrFile: string) {
        let stat;
        try {
          stat = await fs.stat(dirOrFile);
        } catch {
          return;
        }

        if (stat.isFile()) {
          const ext = path.extname(dirOrFile).toLowerCase();
          if (stat.size >= 1024 && !excludedExtensions.includes(ext)) {
            const content = await fs.readFile(dirOrFile);

            // Gzip (level 9)
            const gzipped = await gzipPromise(content, { level: 9 });
            await fs.writeFile(`${dirOrFile}.gz`, gzipped);

            // Brotli (quality 11)
            const brotlied = await brotliPromise(content, {
              params: {
                [constants.BROTLI_PARAM_QUALITY]: 11,
              },
            });
            await fs.writeFile(`${dirOrFile}.br`, brotlied);
          }
        } else if (stat.isDirectory()) {
          const files = await fs.readdir(dirOrFile);
          for (const file of files) {
            await walkAndCompress(path.join(dirOrFile, file));
          }
        }
      }

      for (const target of targets) {
        await walkAndCompress(path.join(distDir, target));
      }
    },
  };
}

// Bake per-route Open Graph / Twitter Card tags into static HTML at build time.
//
// The SPA sets these client-side for real browsers, but link-unfurling crawlers
// (Slack, Facebook, X, LinkedIn, iMessage, ...) do not run JavaScript. Prerendering
// flat per-route files (e.g. dist/compress.html) means every static host - Cloudflare
// Pages, Docker's bundled static dir, desktop - serves correct previews with NO
// server-side rendering. Cloudflare Pages serves `compress.html` at `/compress`
// automatically (clean URLs), and the Spring backend serves the same file.
//
// Absolute URLs (best for Facebook/X) are used when a canonical base is known:
// VITE_OG_BASE_URL (custom domain) or CF_PAGES_URL (set automatically by Cloudflare
// Pages). Otherwise URLs stay root-relative, which still resolves against whatever
// origin serves the page (correct for self-hosted Docker). Logic lives in
// scripts/og-prerender.mjs so it can be unit-tested without a full build.
function prerenderOgPlugin(): PluginOption {
  return {
    name: "prerender-og",
    apply: "build" as const,
    async closeBundle() {
      const { prerenderOg } = await import("./scripts/og-prerender.mjs");
      const ogBase = (
        process.env.VITE_OG_BASE_URL ||
        process.env.CF_PAGES_URL ||
        ""
      ).replace(/\/+$/, "");
      // Absolute deploy base for nested routes' <base href> (matches vite `base`).
      const subpath = (process.env.RUN_SUBPATH || "").replace(/^\/+|\/+$/g, "");
      const baseHref = subpath ? `/${subpath}/` : "/";
      let manifest;
      try {
        manifest = JSON.parse(
          await fs.readFile(
            path.resolve(__dirname, "public/og-metadata.json"),
            "utf8",
          ),
        );
      } catch {
        console.warn(
          "[prerender-og] public/og-metadata.json missing; skipping OG prerender. " +
            "Run `node scripts/generate-og-metadata.mjs`.",
        );
        return;
      }
      const distDir = path.resolve(__dirname, "dist");
      const count = await prerenderOg({ distDir, manifest, ogBase, baseHref });
      console.log(
        `[prerender-og] wrote ${count} prerendered route pages` +
          (ogBase
            ? ` (absolute URLs, base=${ogBase})`
            : " (root-relative URLs)"),
      );
    },
  };
}

// NOTE: cloud/ is a SHARED layer, not a runnable build flavor — it's compiled
// into the saas and desktop builds. It has no entry here and no vite tsconfig;
// it is only typechecked standalone via editor/src/cloud/tsconfig.json
// (task frontend:typecheck:cloud) to prove it carries no saas/desktop-only deps.
const VALID_MODES = [
  "core",
  "proprietary",
  "saas",
  "desktop",
  "prototypes",
] as const;
type BuildMode = (typeof VALID_MODES)[number];

const TSCONFIG_MAP: Record<BuildMode, string> = {
  core: "./tsconfig.core.vite.json",
  proprietary: "./tsconfig.proprietary.vite.json",
  saas: "./tsconfig.saas.vite.json",
  desktop: "./tsconfig.desktop.vite.json",
  prototypes: "./tsconfig.prototypes.vite.json",
};

export default defineConfig(async ({ mode }) => {
  // Load env files relative to this config (frontend/editor/), regardless of
  // where the build was invoked from. The previous `process.cwd()` worked when
  // this file lived at frontend/, but after the editor was moved under
  // frontend/editor/ the cwd-based lookup would miss editor/.env*.
  const env = loadEnv(mode, import.meta.dirname, "");
  const parentEnv = loadEnv(mode, resolve(import.meta.dirname, ".."), "");

  // Effective mode: --mode > STIRLING_FLAVOR > ENABLE_SAAS > DISABLE_ADDITIONAL_FEATURES > proprietary.
  const explicitMode = (VALID_MODES as readonly string[]).includes(mode)
    ? (mode as BuildMode)
    : null;
  const flavor = (process.env.STIRLING_FLAVOR ?? "").toLowerCase();
  const flavorMode: BuildMode | null =
    flavor === "core" || flavor === "proprietary" || flavor === "saas"
      ? (flavor as BuildMode)
      : null;
  const effectiveMode: BuildMode =
    explicitMode ??
    flavorMode ??
    (process.env.ENABLE_SAAS === "true"
      ? "saas"
      : process.env.DISABLE_ADDITIONAL_FEATURES === "true"
        ? "core"
        : "proprietary");

  const tsconfigProject = TSCONFIG_MAP[effectiveMode];

  // Backend proxy target: default localhost:8080. Override via BACKEND_URL env var
  // so the top-level dev launcher can wire a dynamically-assigned backend port.
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
  // Allow host header checks to be configured via env so LAN/reverse-proxy
  // dev setups don't require editing this file for each machine.
  const allowedHostsRaw =
    process.env.FRONTEND_ALLOWED_HOSTS ||
    env.FRONTEND_ALLOWED_HOSTS ||
    parentEnv.FRONTEND_ALLOWED_HOSTS ||
    "";
  const allowedHosts = allowedHostsRaw
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const backendProxy = {
    target: backendUrl,
    changeOrigin: true,
    secure: false,
    xfwd: true,
  };

  // Shared between `vite` (dev) and `vite preview` (production-build serve, used
  // in CI/E2E) so the live test suite still resolves /api → :8080.
  const backendProxyConfig =
    effectiveMode === "desktop"
      ? undefined
      : {
          "/api": backendProxy,
          "/oauth2": backendProxy,
          "/saml2": backendProxy,
          "/login/oauth2": backendProxy,
          "/login/saml2": backendProxy,
          "/swagger-ui": backendProxy,
          "/v1/api-docs": backendProxy,
        };

  return {
    plugins: [
      react(),
      tsconfigPaths({
        projects: [tsconfigProject],
      }),
      compression({
        threshold: 1024,
        exclude: [/\.(png|jpg|jpeg|gif|webp|woff|woff2)$/],
        algorithms: [
          defineAlgorithm("gzip", { level: 9 }),
          defineAlgorithm("brotliCompress", {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: 11,
            },
          }),
        ],
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
      viteStaticCopy({
        targets: [
          {
            // node_modules is hoisted to the workspace root (frontend/), so
            // these paths walk up one level from editor/.
            src: "../node_modules/@embedpdf/pdfium/dist/pdfium.wasm",
            dest: "pdfium",
          },
          {
            // Copy jscanify vendor files to dist
            src: "public/vendor/jscanify/*",
            dest: "vendor/jscanify",
          },
          {
            // pdfjs-dist CMap data for CJK / non-latin glyph mapping. Required
            // when rendering PDFs inside workers where the default DOM fetch paths
            // aren't available.
            src: "../node_modules/pdfjs-dist/cmaps/*",
            dest: "pdfjs/cmaps",
          },
          {
            // pdfjs-dist standard font data (Helvetica/Times/etc.) needed so
            // workers can substitute non-embedded base 14 fonts without DOM access.
            src: "../node_modules/pdfjs-dist/standard_fonts/*",
            dest: "pdfjs/standard_fonts",
          },
        ],
      }),
      compressStaticCopyPlugin(),
      prerenderOgPlugin(),
    ],
    resolve: {
      // Global alias so @shared resolves for ALL importers — including the
      // shared components' own `@shared/components/X.css` self-imports, which
      // live outside the editor tsconfig scope and so aren't rewritten by
      // vite-tsconfig-paths. Required for the editor to consume SUI components.
      alias: {
        "@shared": path.resolve(__dirname, "../shared"),
      },
    },
    server: {
      host: true,
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
      // make sure this port matches the devUrl port in tauri.conf.json file
      port: 5173,
      // Tauri expects a fixed port, fail if that port is not available
      strictPort: true,
      watch: {
        // tell vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
      // Only use proxy in web mode - Tauri handles backend connections directly
      proxy: backendProxyConfig,
    },
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: backendProxyConfig,
    },
    build: {
      target: "esnext",
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom"],
            "pdf-engine": ["@embedpdf/engines", "@embedpdf/pdfium"],
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ["@embedpdf/pdfium"],
    },
    // base: "./" produces relative asset URLs which work when dist/ is served
    // at any path (e.g. Spring Boot bundling the frontend at /). But under
    // `vite preview` for deep SPA routes (e.g. /workflow/sign/<token>), the
    // browser resolves ./assets/X.js relative to the current path → 404, then
    // SPA fallback returns index.html as text/html and React never mounts.
    // VITE_BUILD_FOR_PREVIEW=1 (set by the CI playwright steps) overrides to
    // an absolute base so deep-route asset paths resolve to /assets/...
    // Trailing slash required: it becomes `<base href>`, and browsers resolve
    // relative URLs (manifest.json, favicon) against the base's *directory*.
    base: env.RUN_SUBPATH
      ? `/${env.RUN_SUBPATH}/`
      : process.env.VITE_BUILD_FOR_PREVIEW === "1"
        ? "/"
        : "./",
  };
});
