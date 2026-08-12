import react from "@vitejs/plugin-react-swc";
import { compression, defineAlgorithm } from "vite-plugin-compression2";
import fs from "node:fs/promises";
import path, { resolve } from "node:path";
import { constants, brotliCompress, gzip } from "node:zlib";
import { promisify } from "node:util";
import { defineConfig, loadEnv } from "vite";
import type { Connect, PluginOption } from "vite";
import type { PreRenderedAsset } from "rollup";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteStaticCopy } from "vite-plugin-static-copy";

const gzipPromise = promisify(gzip);
const brotliPromise = promisify(brotliCompress);

// Let the two precompression passes saturate more than the default 4 libuv
// threads. Must be set before zlib first uses the threadpool, so it lives at
// the top of the config module.
process.env.UV_THREADPOOL_SIZE ??= "64";

function resolveBase(runSubpath: string): string {
  if (runSubpath) return `/${runSubpath}/`;
  return process.env.VITE_BUILD_FOR_PREVIEW === "1" ? "/" : "./";
}

// Extensions never precompressed by either compression pass. Both
// vite-plugin-compression2 (regex) and compressStaticCopyPlugin (Set) derive
// from this single list. wasm is excluded: it is already internally compressed
// and precompressed copies can break WebAssembly.instantiateStreaming if the
// host serves the .br/.gz with a wrong Content-Type.
const COMPRESSION_EXCLUDED_EXTENSIONS = [
  ".gz",
  ".br",
  ".wasm",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".woff",
  ".woff2",
];
const EXCLUDED_EXTENSION_SET = new Set(COMPRESSION_EXCLUDED_EXTENSIONS);
const COMPRESSION_EXCLUDE_REGEX = new RegExp(
  `\\.(${COMPRESSION_EXCLUDED_EXTENSIONS.map((e) => e.slice(1)).join("|")})$`,
);

// Write .gz and .br siblings for a file. Brotli quality 11 is 10-100x slower
// than gzip, so back off to quality 10 above 1 MB and hint the input size so
// the encoder can size its window up front.
async function compressOne(file: string, root: string) {
  // Only ever read inside the build output dir. All inputs derive from
  // fs.readdir(distDir), but this guard keeps any stray path from escaping it.
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) return;

  const ext = path.extname(resolved).toLowerCase();
  if (EXCLUDED_EXTENSION_SET.has(ext)) return;
  const content = await fs.readFile(resolved);
  if (content.length < 1024) return;

  // Run both encoders concurrently. With UV_THREADPOOL_SIZE raised above they
  // share the libuv pool and parallelize across cores instead of serializing
  // gzip then brotli per file.
  const brotliQuality = content.length > 1_000_000 ? 10 : 11;
  const [gz, br] = await Promise.all([
    gzipPromise(content, { level: 9 }),
    brotliPromise(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: brotliQuality,
        [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
      },
    }),
  ]);
  await Promise.all([
    fs.writeFile(`${resolved}.gz`, gz),
    fs.writeFile(`${resolved}.br`, br),
  ]);
}

// Emit pdf.js's hashed .mjs worker assets as .js. Cloudflare caches by file
// extension (not MIME type) and its default list omits .mjs, so those assets
// bypassed the edge cache on every request. The extension is irrelevant to a
// `type: "module"` worker. Renaming at emission time lets Rollup substitute the
// final filename into every `new URL(..., import.meta.url)` reference itself.
// Shared by the main build and Vite's worker sub-builds, which do not inherit
// the main build's output options.
const mjsToJsAssetFileNames = (assetInfo: PreRenderedAsset) =>
  assetInfo.names.some((name) => name.endsWith(".mjs"))
    ? "assets/[name]-[hash].js"
    : "assets/[name]-[hash][extname]";

// The entry module script is the critical render-blocking resource. Mark it
// fetchpriority=high so the browser fetches it ahead of the vendor preloads.
function entryFetchPriorityPlugin(): PluginOption {
  return {
    name: "entry-fetch-priority",
    apply: "build" as const,
    transformIndexHtml(html) {
      return html.replace(
        /<script type="module"([^>]*)>/,
        '<script type="module"$1 fetchpriority="high">',
      );
    },
  };
}

function compressStaticCopyPlugin(): PluginOption {
  return {
    name: "compress-static-copy",
    apply: "build" as const,
    async closeBundle() {
      const distDir = path.resolve(import.meta.dirname, "dist");
      const targets = ["pdfium", "vendor", "pdfjs"];

      // Collect first, then compress with bounded concurrency. zlib's async API
      // runs on libuv's threadpool, so a serial loop idles most cores on the
      // build's most CPU-heavy step.
      const files: string[] = [];
      const walk = async (dir: string) => {
        let entries;
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(p);
          else files.push(p);
        }
      };
      for (const target of targets) await walk(path.join(distDir, target));

      const POOL = 8;
      for (let i = 0; i < files.length; i += POOL) {
        await Promise.all(
          files.slice(i, i + POOL).map((f) => compressOne(f, distDir)),
        );
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
function prerenderOgPlugin(isSaas: boolean): PluginOption {
  // SaaS (stirling.com) prerenders the marketing cards from a dedicated
  // manifest; every other flavour uses the tool-registry manifest.
  const manifestFile = isSaas
    ? "public/og-metadata.saas.json"
    : "public/og-metadata.json";
  return {
    name: "prerender-og",
    apply: "build" as const,
    async closeBundle() {
      // oxlint-disable-next-line no-restricted-imports -- vite config runs before path aliases resolve, so a relative import is required here
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
            path.resolve(import.meta.dirname, manifestFile),
            "utf8",
          ),
        );
      } catch {
        console.warn(
          `[prerender-og] ${manifestFile} missing; skipping OG prerender. ` +
            "Run `node scripts/generate-og-metadata.mjs`.",
        );
        return;
      }
      const distDir = path.resolve(import.meta.dirname, "dist");
      await prerenderOg({ distDir, manifest, ogBase, baseHref });

      // closeBundle hooks run concurrently in Vite, not in plugin order, so a
      // sibling plugin cannot reliably compress files written here. Compress the
      // freshly written route HTML here instead (index.html is already handled by
      // the main compression plugin) so Spring's EncodedResourceResolver can serve
      // it precompressed. Nested routes (e.g. dist/settings/people.html) are
      // included, so walk the whole dist tree.
      const htmlFiles: string[] = [];
      const walkHtml = async (dir: string) => {
        let entries;
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) await walkHtml(p);
          else if (
            entry.name.endsWith(".html") &&
            entry.name !== "index.html"
          ) {
            htmlFiles.push(p);
          }
        }
      };
      await walkHtml(distDir);
      await Promise.all(htmlFiles.map((f) => compressOne(f, distDir)));
    },
  };
}

/**
 * When the app is served under a subpath (RUN_SUBPATH to base like "/app/"), Vite
 * serves index.html at "/app/" and redirects "/" to the base, but a bare "/app"
 * (no trailing slash) 404s. This middleware redirects "/app" to "/app/" so either
 * form loads the app in dev and `vite preview`. Query strings are preserved.
 * 302 (not 301) so a changed RUN_SUBPATH never leaves a permanently cached
 * redirect in a dev browser.
 */
function subpathBareRedirectPlugin(subpath: string): PluginOption {
  const bare = `/${subpath}`;
  const withSlash = `${bare}/`;
  const redirect: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? "";
    const q = url.indexOf("?");
    const pathname = q === -1 ? url : url.slice(0, q);
    if (pathname === bare) {
      res.statusCode = 302;
      res.setHeader("Location", withSlash + (q === -1 ? "" : url.slice(q)));
      res.end();
      return;
    }
    next();
  };
  return {
    name: "subpath-bare-redirect",
    configureServer(server) {
      server.middlewares.use(redirect);
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirect);
    },
  };
}

// NOTE: cloud/ is a SHARED layer, not a runnable build flavor. It's compiled
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

export default defineConfig(async ({ mode, command }) => {
  // Dev-only browser-tab label (worktree folder basename) surfaced by the
  // top-level dev tasks so concurrent worktrees have distinguishable tabs.
  // Only injected during `vite` (dev serve), never baked into a production
  // build, and carries only the folder name, no path/host/user info.
  const devWorktreeLabel =
    command === "serve" ? (process.env.STIRLING_DEV_LABEL ?? "") : "";
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

  // Subpath the app is served under (base becomes "/<runSubpath>/"). Empty = root.
  const runSubpath = (env.RUN_SUBPATH || "").replace(/^\/+|\/+$/g, "");

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
    define: {
      __DEV_WORKTREE_LABEL__: JSON.stringify(devWorktreeLabel),
    },
    plugins: [
      react(),
      ...(runSubpath ? [subpathBareRedirectPlugin(runSubpath)] : []),
      tsconfigPaths({
        projects: [tsconfigProject],
      }),
      compression({
        threshold: 1024,
        exclude: [COMPRESSION_EXCLUDE_REGEX],
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
          {
            // Brand assets live in core; the editor serves them by URL per
            // variant, so copy each set to the /{variant}-logo path its
            // manifests, index.html and useLogoAssets resolve against.
            src: "src/core/assets/brand/classic-logo/*",
            dest: "classic-logo",
          },
          {
            src: "src/core/assets/brand/modern-logo/*",
            dest: "modern-logo",
          },
        ],
      }),
      prerenderOgPlugin(effectiveMode === "saas"),
      entryFetchPriorityPlugin(),
      compressStaticCopyPlugin(),
    ],
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
      // The build already precompresses for real and ships a visualizer; the
      // per-chunk gzip measurement Vite does for the log is wasted CI time.
      reportCompressedSize: false,
      // Vite 7 defaults cssMinify to esbuild; lightningcss (Rust) minifies in
      // one pass and can drop prefixes for browsers esnext already excludes.
      cssMinify: "lightningcss" as const,
      rollupOptions: {
        output: {
          assetFileNames: mjsToJsAssetFileNames,
          manualChunks(id: string) {
            if (id.includes("material-symbols-icons.json"))
              return "vendor-iconset";
            if (id.includes("node_modules")) {
              if (id.includes("pdfjs-dist")) return "vendor-pdfjs";
              if (id.includes("@embedpdf")) return "vendor-embedpdf";
              // react/react-dom/scheduler/emotion/mui/mantine are mutually
              // circular, so they must stay in one chunk or module init order
              // breaks at runtime (TDZ ReferenceError).
              if (
                id.includes("react") ||
                id.includes("scheduler") ||
                id.includes("@mantine") ||
                id.includes("@mui") ||
                id.includes("@emotion") ||
                id.includes("@iconify")
              ) {
                return "vendor-ui";
              }
              if (id.includes("@supabase")) return "vendor-supabase";
              if (id.includes("posthog-js") || id.includes("@posthog"))
                return "vendor-posthog";
              if (id.includes("@cantoo/pdf-lib") || id.includes("pdf-lib"))
                return "vendor-pdflib";
              if (
                id.includes("recharts") ||
                id.includes("d3") ||
                id.includes("decimal.js")
              )
                return "vendor-charts";
              if (id.includes("jszip") || id.includes("pako"))
                return "vendor-zip";
              if (id.includes("i18next")) return "vendor-i18n";
            }
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ["@embedpdf/pdfium"],
    },
    // Worker sub-builds do not inherit the main build's output.assetFileNames.
    // Without this, the pdf.js worker referenced from inside a worker would be
    // emitted as .mjs (see mjsToJsAssetFileNames above).
    worker: {
      rollupOptions: {
        output: {
          assetFileNames: mjsToJsAssetFileNames,
        },
      },
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
    base: resolveBase(runSubpath),
  };
});
