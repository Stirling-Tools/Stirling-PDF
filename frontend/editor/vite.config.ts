import react from "@vitejs/plugin-react-swc";
import { compression, defineAlgorithm } from "vite-plugin-compression2";
import fs from "node:fs/promises";
import path, { resolve } from "node:path";
import { constants, brotliCompress, gzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { defineConfig, loadEnv } from "vite";
import type { Connect, PluginOption } from "vite";
import type { PreRenderedAsset } from "rollup";
import tsconfigPaths from "vite-tsconfig-paths";
// oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
import { iconSvgr } from "./scripts/icons/svgrOptions.mts";
import { viteStaticCopy } from "vite-plugin-static-copy";

const gzipPromise = promisify(gzip);
const brotliPromise = promisify(brotliCompress);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Let the two precompression passes saturate more than the default 4 libuv
// threads. Must be set before zlib first uses the threadpool, so it lives at
// the top of the config module.
process.env.UV_THREADPOOL_SIZE ??= "64";

// Extensions never precompressed by either pass; the compression plugin's
// regex and the static-copy walk derive from one list so they cannot drift.
const COMPRESSION_EXCLUDED_EXTENSIONS = [
  ".gz",
  ".br",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
];
const COMPRESSION_EXCLUDE_REGEX = new RegExp(
  `\\.(${COMPRESSION_EXCLUDED_EXTENSIONS.map((e) => e.slice(1)).join("|")})$`,
);
const EXCLUDED_EXTENSION_SET = new Set(COMPRESSION_EXCLUDED_EXTENSIONS);

// Cloudflare caches by file extension (not MIME type) and its default list
// omits .mjs, so pdf.js's hashed worker assets bypassed the edge cache there.
// The extension is irrelevant to a `type: "module"` worker, and renaming at
// emission time lets Rollup substitute the final filename into every
// `new URL(..., import.meta.url)` reference itself. Worker sub-builds need the
// same option because they do not inherit the main build's output options.
const mjsToJsAssetFileNames = (assetInfo: PreRenderedAsset) =>
  assetInfo.names.some((name) => name.endsWith(".mjs"))
    ? "assets/[name]-[hash].js"
    : "assets/[name]-[hash][extname]";

/**
 * Writes .gz and .br siblings for one file, both encoders in flight at once.
 *
 * Only ever reads inside the build output dir. All inputs derive from a walk of
 * dist, but the guard keeps any stray path from escaping it.
 */
async function compressFile(file: string, distDir: string): Promise<void> {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${path.resolve(distDir)}${path.sep}`)) return;

  const ext = path.extname(resolved).toLowerCase();
  if (EXCLUDED_EXTENSION_SET.has(ext)) return;
  // Bundle-emitted assets already have siblings from the compression plugin.
  try {
    await fs.access(`${resolved}.br`);
    return;
  } catch {
    // Not compressed yet.
  }
  const content = await fs.readFile(resolved);
  if (content.length < 1024) return;

  const [gzipped, brotlied] = await Promise.all([
    gzipPromise(content, { level: 9 }),
    brotliPromise(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
      },
    }),
  ]);
  await Promise.all([
    fs.writeFile(`${resolved}.gz`, gzipped),
    fs.writeFile(`${resolved}.br`, brotlied),
  ]);
}

function compressStaticCopyPlugin(): PluginOption {
  return {
    name: "compress-static-copy",
    apply: "build" as const,
    async closeBundle() {
      const distDir = path.resolve(__dirname, "dist");

      // zlib's async API runs on libuv's threadpool, so compressing serially
      // idles most cores on the build's most CPU-heavy step. The walk must cover
      // the whole output: the compression plugin's default include list skips
      // .wasm (the 4.6 MB PDFium binary), and viteStaticCopy output (the PDFium
      // fallback fonts, tens of megabytes) never reaches either other pass.
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

      await walk(distDir);

      const POOL = 16;
      for (let i = 0; i < files.length; i += POOL) {
        await Promise.all(
          files.slice(i, i + POOL).map((f) => compressFile(f, distDir)),
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
// Absolute URLs (best for Facebook/X) are used when the deploy origin is known:
// VITE_OG_BASE_URL (custom domain) or CF_PAGES_URL (set automatically by Cloudflare
// Pages). Otherwise URLs stay root-relative, which still resolves against whatever
// origin serves the page (correct for self-hosted Docker). Indexing signals
// (canonical, JSON-LD, sitemap) need VITE_OG_BASE_URL specifically - see below.
// Logic lives in scripts/og-prerender.mjs so it can be unit-tested without a full build.
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
      const { prerenderOg, buildSitemap, resolveDeployBases } =
        // oxlint-disable-next-line no-restricted-imports -- vite config runs before path aliases resolve, so a relative import is required here
        await import("./scripts/og-prerender.mjs");
      const canonicalOrigin = process.env.VITE_OG_BASE_URL || "";
      const deployOrigin = process.env.CF_PAGES_URL || "";
      // Absolute deploy base for nested routes' <base href> (matches vite `base`).
      const subpath = (process.env.RUN_SUBPATH || "").replace(/^\/+|\/+$/g, "");
      const baseHref = subpath ? `/${subpath}/` : "/";
      const { ogBase, canonicalBase } = resolveDeployBases({
        canonicalOrigin,
        deployOrigin,
        baseHref,
      });
      if (!canonicalBase && ogBase) {
        console.warn(
          "[prerender-og] VITE_OG_BASE_URL is unset: falling back to CF_PAGES_URL " +
            `(${ogBase}) for social-card URLs only. No canonical links, JSON-LD ` +
            "or sitemap will be emitted - set VITE_OG_BASE_URL to the public " +
            "origin to enable them.",
        );
      }
      let manifest;
      try {
        manifest = JSON.parse(
          await fs.readFile(path.resolve(__dirname, manifestFile), "utf8"),
        );
      } catch {
        console.warn(
          `[prerender-og] ${manifestFile} missing; skipping OG prerender. ` +
            "Run `node scripts/generate-og-metadata.mjs`.",
        );
        return;
      }
      const distDir = path.resolve(__dirname, "dist");
      // The crawlable landing body only pays for itself where a crawler can
      // reach the page; self-hosted and desktop builds just get the flash.
      const injectLanding = Boolean(ogBase);
      const count = await prerenderOg({
        distDir,
        manifest,
        ogBase,
        canonicalBase,
        baseHref,
        injectLanding,
      });
      console.log(
        `[prerender-og] wrote ${count} prerendered route pages` +
          (ogBase
            ? ` (absolute URLs, base=${ogBase}, crawlable landing body)`
            : " (root-relative URLs, no landing body)"),
      );

      // Sitemaps are an indexing instruction, so they need the canonical origin,
      // not just any absolute one. Self-hosted and preview builds skip it.
      const sitemap = buildSitemap(manifest, { canonicalBase });
      if (sitemap) {
        await fs.writeFile(path.join(distDir, "sitemap.xml"), sitemap);
        // Point robots.txt at the sitemap (best-effort; robots.txt may be absent).
        const robotsPath = path.join(distDir, "robots.txt");
        try {
          let robots = await fs.readFile(robotsPath, "utf8");
          if (!/^\s*Sitemap:/im.test(robots)) {
            robots =
              robots.replace(/\s*$/, "\n") +
              `Sitemap: ${canonicalBase}/sitemap.xml\n`;
            await fs.writeFile(robotsPath, robots);
          }
        } catch {
          // no robots.txt in dist - nothing to link
        }
        console.log(`[prerender-og] wrote sitemap.xml (base=${canonicalBase})`);
      }
      // closeBundle hooks run concurrently in Vite, not in plugin order, so a
      // sibling plugin cannot reliably compress files written here. index.html
      // is already handled by the main compression plugin; the prerendered
      // nested routes (e.g. dist/settings/people.html) are not, so walk the
      // tree and compress them here for Spring's EncodedResourceResolver.
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
          else if (entry.name.endsWith(".html") && entry.name !== "index.html")
            htmlFiles.push(p);
        }
      };
      await walkHtml(distDir);
      await Promise.all(htmlFiles.map((f) => compressFile(f, distDir)));
    },
  };
}

/**
 * When the app is served under a subpath (RUN_SUBPATH → base like "/app/"), Vite
 * serves index.html at "/app/" and redirects "/" → the base, but a bare "/app"
 * (no trailing slash) 404s. This middleware redirects "/app" → "/app/" so either
 * form loads the app in dev and `vite preview`. Query strings are preserved.
 */
function subpathBareRedirectPlugin(subpath: string): PluginOption {
  const bare = `/${subpath}`;
  const withSlash = `${bare}/`;
  const redirect: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? "";
    const q = url.indexOf("?");
    const pathname = q === -1 ? url : url.slice(0, q);
    if (pathname === bare) {
      res.statusCode = 301;
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

export default defineConfig(async ({ mode, command }) => {
  // Dev-only browser-tab label (worktree folder basename) surfaced by the
  // top-level dev tasks so concurrent worktrees have distinguishable tabs.
  // Only injected during `vite` (dev serve) — never baked into a production
  // build — and carries only the folder name, no path/host/user info.
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
    // Per-mode: the default is one shared node_modules/.vite, so two dev servers in
    // different modes re-optimize over each other and the browser 504s on a stale dep
    // hash. Anchored to frontend/ because a relative path resolves against the vite
    // root (editor/) and would create a second node_modules there.
    cacheDir: resolve(
      import.meta.dirname,
      "..",
      "node_modules",
      `.vite-${effectiveMode}`,
    ),
    resolve: {
      // Linked workspace dependencies must share the renderer's React instance.
      dedupe: ["react", "react-dom"],
    },
    define: {
      __DEV_WORKTREE_LABEL__: JSON.stringify(devWorktreeLabel),
    },
    plugins: [
      iconSvgr(),
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
              filename: "dist/stats.json",
              template: "raw-data",
              gzipSize: true,
              brotliSize: true,
              emitFile: false,
            }) as PluginOption,
          ]
        : []),
      viteStaticCopy({
        targets: [
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
          {
            // Fallback TrueType fonts for PDFium (Noto Sans, CJK, Arabic, etc.)
            src: "../../app/core/src/main/resources/static/fonts/*.ttf",
            dest: "fonts",
          },
        ],
      }),
      compressStaticCopyPlugin(),
      prerenderOgPlugin(effectiveMode === "saas"),
    ],
    // Worker bundles are a separate Rollup pass and do NOT inherit `plugins`,
    // so without this `@app/*` resolves in the app and fails in a worker.
    worker: {
      plugins: () => [tsconfigPaths({ projects: [tsconfigProject] })],
      // Worker sub-builds do not inherit the main build's output options, so
      // without this a worker asset referenced from inside a worker is emitted
      // as .mjs again (see mjsToJsAssetFileNames above).
      rollupOptions: {
        output: {
          assetFileNames: mjsToJsAssetFileNames,
        },
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
      // The build already precompresses for real, so the per-chunk gzip
      // measurement Vite prints is wasted CI time.
      reportCompressedSize: false,
      // Vite defaults CSS to esbuild; lightningcss (Rust) minifies in one pass
      // and can drop prefixes for the esnext target.
      cssMinify: "lightningcss" as const,
      rollupOptions: {
        output: {
          assetFileNames: mjsToJsAssetFileNames,
          manualChunks(id: string) {
            if (id.includes("material-symbols-icons.json"))
              return "vendor-iconset";
            // The dynamic-import preload helper is imported by the entry. Left to
            // Rollup it lands in the first dynamic-importing vendor chunk, and
            // the entry then statically imports that whole chunk (the EmbedPDF
            // engine chunk in this build).
            if (id.includes("vite/preload-helper")) return "vendor-preload";
            if (id.includes("node_modules")) {
              if (id.includes("pdfjs-dist")) return "vendor-pdfjs";
              // Keep the EmbedPDF pieces the startup graph actually uses (the
              // engine stays out of it because only the lazy viewer imports it,
              // and the spread enum is used by viewer contexts) in their own
              // chunks, so the single `vendor-embedpdf` bundle is fetched only
              // when the viewer opens.
              if (id.includes("@embedpdf/engines")) return "vendor-embedpdf";
              if (id.includes("@embedpdf/pdfium")) return "vendor-pdfium";
              if (
                id.includes("@embedpdf/core") ||
                id.includes("@embedpdf/models") ||
                id.includes("@embedpdf/utils") ||
                id.includes("@embedpdf/plugin-spread")
              ) {
                return "vendor-embedpdf-core";
              }
              if (id.includes("@embedpdf")) return "vendor-embedpdf";
              // Leaf UI packages: they import react/emotion but are not imported
              // by them, so they split without creating a chunk cycle. Keeping
              // them separate stops icon edits from invalidating all of vendor-ui.
              if (id.includes("@mui/icons-material")) return "vendor-mui-icons";
              if (id.includes("@iconify/react")) return "vendor-iconify";
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
    // base: "./" produces relative asset URLs which work when dist/ is served
    // at any path (e.g. Spring Boot bundling the frontend at /). But under
    // `vite preview` for deep SPA routes (e.g. /workflow/sign/<token>), the
    // browser resolves ./assets/X.js relative to the current path → 404, then
    // SPA fallback returns index.html as text/html and React never mounts.
    // VITE_BUILD_FOR_PREVIEW=1 (set by the CI playwright steps) overrides to
    // an absolute base so deep-route asset paths resolve to /assets/...
    // Trailing slash required: it becomes `<base href>`, and browsers resolve
    // relative URLs (manifest.json, favicon) against the base's *directory*.
    base: runSubpath
      ? `/${runSubpath}/`
      : process.env.VITE_BUILD_FOR_PREVIEW === "1"
        ? "/"
        : "./",
  };
});
