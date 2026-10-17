import react from "@vitejs/plugin-react-swc";
import { compression, defineAlgorithm } from "vite-plugin-compression2";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path, { resolve } from "node:path";
import { constants, brotliCompress, gzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { defineConfig, loadEnv } from "vite";
import type { Connect, PluginOption, Rollup } from "vite";
import type { PreRenderedAsset } from "rollup";
import tsconfigPaths from "vite-tsconfig-paths";
// oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
import { iconSvgr } from "./scripts/icons/svgrOptions.mts";
import { viteStaticCopy } from "vite-plugin-static-copy";

const gzipPromise = promisify(gzip);
const brotliPromise = promisify(brotliCompress);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// UV_THREADPOOL_SIZE is set by the build entrypoints (the Taskfiles and the
// frontend Dockerfile): loading this config already touches the pool, so it
// cannot be set here.

// One list so the plugin's regex and the walk cannot drift.
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

// Cloudflare's extension-based cache list omits .mjs, so pdf.js's hashed worker
// assets would bypass its edge cache. Renaming at emission also lets Rollup
// rewrite the `new URL(..., import.meta.url)` references; worker sub-builds need
// the same option because they do not inherit the main build's output options.
const mjsToJsAssetFileNames = (assetInfo: PreRenderedAsset) =>
  assetInfo.names.some((name) => name.endsWith(".mjs"))
    ? "assets/[name]-[hash].js"
    : "assets/[name]-[hash][extname]";

// A variant only earns its place when it is meaningfully smaller than the source
// it shadows; the encoders happily emit a sidecar larger than a small or already
// compressed file. The bundler pass drops non-shrinking variants too
// (skipIfLargerOrEqual) and this walk treats its output as fresh, so the two
// passes agree in practice.
const MIN_COMPRESSION_RATIO = 0.98;

/** True when `sibling` exists and is at least as new as the source. */
async function isFresh(
  sibling: string,
  sourceMtimeMs: number,
): Promise<boolean> {
  try {
    return (await fs.stat(sibling)).mtimeMs >= sourceMtimeMs;
  } catch {
    return false;
  }
}

/** Writes through a same-directory temp file so a reader never sees a partial sidecar. */
async function writeVariant(target: string, bytes: Uint8Array): Promise<void> {
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, bytes);
  await fs.rename(temp, target);
}

async function writeVariantIfSmaller(
  target: string,
  encoded: Uint8Array,
  sourceLength: number,
): Promise<void> {
  if (encoded.length < sourceLength * MIN_COMPRESSION_RATIO) {
    await writeVariant(target, encoded);
  } else {
    // Never leave a variant that shadows the source without a real saving.
    await fs.rm(target, { force: true });
  }
}

/** Compresses one file under `distDir`; paths outside it are ignored. */
async function compressFile(file: string, distDir: string): Promise<void> {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${path.resolve(distDir)}${path.sep}`)) return;

  const ext = path.extname(resolved).toLowerCase();
  if (EXCLUDED_EXTENSION_SET.has(ext)) return;

  const gzPath = `${resolved}.gz`;
  const brPath = `${resolved}.br`;

  // The bundler pass wrote some siblings; the walk runs over an existing dist,
  // so a stale one has to be replaced rather than trusted. Each encoding is
  // checked independently: a fresh .br next to a stale .gz is not a pair.
  const source = await fs.stat(resolved);
  const [gzFresh, brFresh] = await Promise.all([
    isFresh(gzPath, source.mtimeMs),
    isFresh(brPath, source.mtimeMs),
  ]);
  if (gzFresh && brFresh) return;

  // A source that shrank below the threshold must not keep serving the variants
  // left over from when it was larger.
  if (source.size < 1024) {
    await Promise.all([
      fs.rm(gzPath, { force: true }),
      fs.rm(brPath, { force: true }),
    ]);
    return;
  }

  const content = await fs.readFile(resolved);
  const [gzipped, brotlied] = await Promise.all([
    gzipPromise(content, { level: 9 }),
    brotliPromise(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
      },
    }),
  ]);
  await Promise.all([
    writeVariantIfSmaller(gzPath, gzipped, content.length),
    writeVariantIfSmaller(brPath, brotlied, content.length),
  ]);
}

// Batching bounds the zlib queue: 16 files with both encoders in flight is up
// to 32 jobs against the 16-thread libuv pool set by the build entrypoints.
const COMPRESSION_BATCH_FILES = 16;

async function compressFiles(files: string[], distDir: string): Promise<void> {
  for (let i = 0; i < files.length; i += COMPRESSION_BATCH_FILES) {
    await Promise.all(
      files
        .slice(i, i + COMPRESSION_BATCH_FILES)
        .map((f) => compressFile(f, distDir)),
    );
  }
}

type ManualChunkMeta = Parameters<Rollup.GetManualChunk>[1];

const startupModulesByOutput = new WeakMap<ManualChunkMeta, Set<string>>();

/**
 * The modules the entry imports statically: these load before first render, so
 * a chunk every page loads should hold only them. Memoized per output because
 * Rollup hands manualChunks the module graph once per output.
 */
function startupModules(meta: ManualChunkMeta): Set<string> {
  let modules = startupModulesByOutput.get(meta);
  if (modules) return modules;
  modules = new Set();
  const queue = [...meta.getModuleIds()].filter(
    (id) => meta.getModuleInfo(id)?.isEntry,
  );
  for (const id of queue) {
    if (modules.has(id)) continue;
    modules.add(id);
    queue.push(...(meta.getModuleInfo(id)?.importedIds ?? []));
  }
  startupModulesByOutput.set(meta, modules);
  return modules;
}

/**
 * Mantine components only lazy screens use. The barrel re-exports all of them,
 * so the startup walk above counts those re-export edges as reachability and
 * `manualChunks` files every implementation with vendor-ui, which the editor
 * preloads. `mantineToolOnlyImports` rewrites the app's imports to the
 * implementations, and `manualChunks` gives each component family its own
 * chunk, so a screen that opens one fetches only that family.
 *
 * Inclusion is measured twice. First, every application module that imports one
 * of these has to land in a lazy chunk, or a startup screen would fetch it.
 * Second, after the build, no preloaded chunk may statically import the family's
 * chunk: Mantine's own preloaded modules reach into each other (`Menu` renders a
 * `Popover`, `Modal` a `FocusTrap`), and a family a preloaded chunk imports both
 * re-enters the preload set and can close an initialisation cycle that breaks
 * the app. A `generateBundle` check in the plugin fails the build on that cycle
 * rather than shipping a page that cannot render.
 *
 * `Accordion`, `Checkbox`, `Combobox`, `Flex`, `FocusTrap`, `Overlay`, `Pill`,
 * `Popover`, `Select`, `Transition` and `VisuallyHidden` were removed for the
 * second reason. Some came back as modulepreload links and stopped the app from
 * rendering; the rest are reached by the first screen: `Landing`, the route the
 * build preloads, statically imports `Flex`'s family (`Footer`), `Pill`'s
 * (`Chip`) and `Select`'s (the onboarding `SecurityCheckSlide`), and `Checkbox`
 * and `Combobox` arrive through Mantine's own `Select`/`Flex` internals.
 * `useCombobox` went with them: it resolves into the same `Combobox` family, so
 * leaving it listed kept the very chunk that closed the cycle.
 * `NumberInput` qualified once `UpdateSeatsModal`, its only startup-reachable
 * consumer, moved behind a lazy import; `SegmentedControl` is out because its
 * wrapper's chunk is fetched immediately after first paint, so it would drag
 * its family with it.
 */
const MANTINE_TOOL_ONLY_COMPONENTS = [
  "Autocomplete",
  "Avatar",
  "Card",
  "Code",
  "ColorInput",
  "ColorPicker",
  "ColorSwatch",
  "CopyButton",
  "Drawer",
  "FileButton",
  "FileInput",
  "Grid",
  "Image",
  "List",
  "LoadingOverlay",
  "MultiSelect",
  "Notification",
  "NumberFormatter",
  "NumberInput",
  "Pagination",
  "SimpleGrid",
  "Skeleton",
  "Slider",
  "Table",
  "TableTbody",
  "TableTd",
  "TableTh",
  "TableThead",
  "TableTr",
  "Tabs",
  "TagsInput",
  "ThemeIcon",
  "Title",
];

/**
 * Filled by `mantineToolOnlyImports` while the config is built, then read by
 * `manualChunks` during the build. An empty implementations map leaves every
 * app import alone and every implementation in vendor-ui.
 */
const mantineToolOnlyImplementations = new Map<string, string>();
const mantineToolOnlyFamilies = new Map<string, string>();

function mantineToolOnlyChunk(id: string): string | undefined {
  for (const [dir, family] of mantineToolOnlyFamilies) {
    if (id.startsWith(dir)) return `vendor-mantine-${family}`;
  }
  return undefined;
}

/**
 * The npm package a normalized module id belongs to, or null for app code. Ids
 * are absolute paths, often through a pnpm store, so the package is the segment
 * after the last node_modules. Matching on that segment, rather than a raw path
 * substring, keeps a directory that merely looks like a package from steering
 * the split.
 */
function packageNameOf(id: string): string | null {
  const marker = "node_modules/";
  const index = id.lastIndexOf(marker);
  // Reject a match inside a longer directory name such as "my-node_modules".
  if (index === -1 || (index > 0 && id[index - 1] !== "/")) return null;
  const [first, second] = id.slice(index + marker.length).split("/");
  if (!first) return null;
  return first.startsWith("@") ? `${first}/${second ?? ""}` : first;
}

function inScope(pkg: string, scope: string): boolean {
  return pkg === scope || pkg.startsWith(`${scope}/`);
}

// react-markdown and its remark/micromark/mdast/hast closure is heavy and only
// needed when a disclaimer, document or chat message renders. Matching on the
// package name keeps an app file named like one of these out of the chunk.
const MARKDOWN_PACKAGE_PREFIXES = [
  "remark-",
  "rehype-",
  "micromark",
  "mdast-",
  "hast-",
  "unist-",
  "estree-util-",
  "style-to-",
  "character-entities",
  "vfile",
] as const;
const MARKDOWN_PACKAGES = new Set([
  "react-markdown",
  "unified",
  "parse-entities",
  "decode-named-character-reference",
  "markdown-table",
  "devlop",
  "longest-streak",
  "ccount",
  "zwitch",
  "trough",
  "bail",
  "is-plain-obj",
  "property-information",
  "space-separated-tokens",
  "comma-separated-tokens",
  "trim-lines",
  "html-url-attributes",
  "@ungap/structured-clone",
]);

function isMarkdownPackage(pkg: string): boolean {
  return (
    MARKDOWN_PACKAGES.has(pkg) ||
    MARKDOWN_PACKAGE_PREFIXES.some((prefix) => pkg.startsWith(prefix))
  );
}

/**
 * Preload for the one dictionary the app is about to fetch.
 *
 * en-US is only the answer when the browser asks for nothing else: the delivery
 * files carry the source strings, so the language every visitor used to need is
 * now just one of the languages.
 */
function localePreloadTag(codes: string[]): string {
  // The landing boots on intent, so its dictionary rides that boot; a deep route boots
  // at parse time and gets the preload ahead of the app's own request.
  return `<script>
      window.__spdfLocalePreload = function () {
        var supported = ${JSON.stringify(codes)};
        var stored = null;
        try {
          stored = localStorage.getItem("i18nextLng");
        } catch (e) {
          /* storage blocked: the browser language below still applies */
        }
        var wanted = String(stored || navigator.language || "en-US").replace(
          "_",
          "-",
        );
        var match = null;
        for (var i = 0; i < supported.length; i++) {
          if (supported[i].toLowerCase() === wanted.toLowerCase()) {
            match = supported[i];
            break;
          }
        }
        // No match - including a bare "en" - means en-US, the same mapping the
        // app applies in detection.convertDetectedLanguage.
        if (!match) match = "en-US";
        var link = document.createElement("link");
        link.rel = "preload";
        link.as = "fetch";
        link.crossOrigin = "anonymous";
        link.href =
          "locales/" + encodeURIComponent(match) + "/startup.json";
        document.head.appendChild(link);
      };
    </script>`;
}

/**
 * Generates the locale delivery files and injects the startup preload for one
 * of them.
 *
 * `public/locales/<lng>/translation.toml` stays the authored source; the build
 * writes both the complete `translation.json` beside it and the `startup.json`
 * subset that the first screen actually fetches. Logic lives in
 * scripts/generate-locale-assets.mjs so it can be run and tested on its own.
 */
/**
 * Preloads the initial route's own files from the built HTML.
 *
 * The route is reached through a dynamic import, so its chunk is discovered only
 * once the entry has downloaded and run: one more serial hop on exactly the
 * chain the largest contentful paint waits for. Filenames are hashed and known
 * only after bundling, so the links are written once the bundle exists. Only the
 * route chunk and the CSS it needs are preloaded - the chunks it imports later
 * belong to other routes as well, and preloading those would compete with the
 * resources this one waits for.
 */
// Every page the app can be served from gets the hints: a route page is its own
// document, and without them it discovers the same chunks one round trip later.
async function writeRouteHints(
  distDir: string,
  route: { js: string; css: string[] },
): Promise<void> {
  const pages = (await fs.readdir(distDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => resolve(distDir, entry.name));
  for (const page of pages) {
    let html: string;
    try {
      html = await fs.readFile(page, "utf8");
    } catch {
      continue;
    }
    if (html.includes(route.js)) continue;

    // Take the href prefix from a link Vite already wrote, so a subpath
    // deployment is handled the same way its own preloads are.
    const existing = /<link rel="modulepreload" href="([^"]+)"/.exec(html);
    const prefix = existing
      ? existing[1].slice(0, existing[1].lastIndexOf("/") + 1)
      : "/";

    const tags = [
      `<link rel="modulepreload" href="${prefix}${route.js}" crossorigin>`,
      ...route.css.map(
        (file) => `<link rel="preload" as="style" href="${prefix}${file}">`,
      ),
    ];
    await fs.writeFile(
      page,
      html.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`),
    );
  }
}

/**
 * Puts the landing screen's first paint into index.html, so the largest paint
 * does not wait for the Landing chunk to parse and run. The capture drives a
 * real browser against the finished dist and the app's own API stubs, so it can
 * fail (browser download missing, stubs drifted) on a machine that still has a
 * working build: warn and leave the page alone rather than fail the build.
 */
async function writeLandingShell(
  distDir: string,
  editorDir: string,
): Promise<void> {
  try {
    const { prerenderShell } =
      // oxlint-disable-next-line no-restricted-imports -- config runs in node, before the aliases exist
      await import("./scripts/prerender-shell.mjs");
    const result = await prerenderShell({ distDir, editorDir });
    console.log(
      `[prerender-shell] ${result.languages} languages, ${result.nodes} text nodes, ${(
        result.bytes / 1024
      ).toFixed(1)} KiB` +
        (result.dropped.length
          ? `; no shell for ${result.dropped.join(", ")}`
          : ""),
    );
  } catch (error) {
    if (process.env.PRERENDER_SHELL_SKIP === "1") {
      console.warn(`[prerender-shell] skipped: ${String(error)}`);
      return;
    }
    throw error;
  }
}

function localeAssetsPlugin(): PluginOption {
  return {
    name: "locale-assets",
    async configResolved() {
      const { generateLocaleAssets } =
        // oxlint-disable-next-line no-restricted-imports -- vite config runs before path aliases resolve, so a relative import is required here
        await import("./scripts/generate-locale-assets.mjs");
      generateLocaleAssets({ log: (message: string) => console.log(message) });
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html: string) {
        const { deliveredLocaleCodes } =
          // oxlint-disable-next-line no-restricted-imports -- vite config runs before path aliases resolve, so a relative import is required here
          await import("./scripts/generate-locale-assets.mjs");
        return html.replace(
          "<!--LOCALE_PRELOAD-->",
          localePreloadTag(deliveredLocaleCodes()),
        );
      },
    },
  };
}

function compressStaticCopyPlugin(): PluginOption {
  return {
    name: "compress-static-copy",
    apply: "build" as const,
    async closeBundle() {
      const distDir = path.resolve(__dirname, "dist");

      // The plugin's include list skips .wasm and viteStaticCopy output never
      // reaches it, so the walk has to cover the rest of dist. HTML, sitemap.xml
      // and robots.txt are left to the html-output pass, which owns every one of
      // those writes and compresses them once it has made them.
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
          else if (
            !entry.name.endsWith(".html") &&
            entry.name !== "sitemap.xml" &&
            entry.name !== "robots.txt"
          )
            files.push(p);
        }
      };

      await walk(distDir);

      await compressFiles(files, distDir);

      // The TTFs are only ever requested through the backend, which serves the
      // .br/.gz siblings and falls back to its own classpath copy of the raw
      // file. Shipping the raw set in dist would duplicate ~100 MB for nothing.
      // NotoSans-Regular.ttf stays: the text editor's Unicode fallback fetches
      // it directly, and static hosts have no classpath to fall back to.
      const fontsDir = path.join(distDir, "fonts");
      const fontEntries = await fs.readdir(fontsDir).catch(() => []);
      await Promise.all(
        fontEntries
          .filter(
            (name) => name.endsWith(".ttf") && name !== "NotoSans-Regular.ttf",
          )
          .map((name) => fs.rm(path.join(fontsDir, name), { force: true })),
      );
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
async function writeOpenGraphPages(
  distDir: string,
  isSaas: boolean,
): Promise<void> {
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
  const manifestFile = isSaas
    ? "public/og-metadata.saas.json"
    : "public/og-metadata.json";
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
  // The crawlable landing body only pays for itself where a crawler can reach
  // the page; self-hosted and desktop builds just get the flash.
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
  if (!sitemap) return;
  await fs.writeFile(path.join(distDir, "sitemap.xml"), sitemap);
  // Point robots.txt at the sitemap (best-effort; robots.txt may be absent).
  // Static hosts only: packaged builds exclude dist/robots.txt and serve it
  // from RobotsController, gated on system.googlevisibility.
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

/**
 * Precompresses the HTML the passes above produced, after the last of them has
 * run: the bundler wrote siblings for the pre-prerender `index.html`, which
 * describes a document that no longer exists.
 */
async function compressHtmlOutput(distDir: string): Promise<void> {
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
      else if (
        entry.name.endsWith(".html") ||
        entry.name === "sitemap.xml" ||
        entry.name === "robots.txt"
      )
        files.push(p);
    }
  };
  await walk(distDir);
  // The shell's per-language words are fetched during the first paint of a
  // visitor whose language is not the base one.
  try {
    const shells = path.join(distDir, "shells");
    for (const entry of await fs.readdir(shells, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".json"))
        files.push(path.join(shells, entry.name));
    }
  } catch {
    // no shells directory: the prerender pass was skipped
  }
  await Promise.all(
    files
      .filter((file) => file.endsWith(".html"))
      .flatMap((file) => [`${file}.br`, `${file}.gz`])
      .map((file) => fs.rm(file, { force: true })),
  );
  await compressFiles(files, distDir);
}

/**
 * Rewrites the app's `@mantine/core` imports of `MANTINE_TOOL_ONLY_COMPONENTS`
 * to the implementation files the barrel re-exports them from. That removes the
 * barrel edge which otherwise tells `manualChunks` the component is reachable
 * from the entry. Central here so no application file names an internal Mantine
 * path. Reads the installed barrel to find those files, and fails the build when
 * a name stops resolving to a component directory.
 *
 * Build-only: dev resolves `@mantine/core` through the dependency optimizer, so
 * a raw `.mjs` import beside it would load a second copy of Mantine's context
 * modules and the components would lose the provider theme. The type checker
 * never sees this rewrite, so types keep resolving through the package.
 */
function mantineToolOnlyImports(): PluginOption {
  const packageDir = path.dirname(
    createRequire(import.meta.url).resolve("@mantine/core/styles.css"),
  );
  const esmDir = path.join(packageDir, "esm");
  const componentRoot = `${path.join(esmDir, "components")}/`;
  const barrel = readFileSync(path.join(esmDir, "index.mjs"), "utf8");

  // The barrel is the only place that maps an exported name to its file, and the
  // naming is not uniform (`Slider` lives in `Slider/Slider/Slider.mjs`,
  // `TableTr` in `Table/Table.components.mjs`), so read it rather than template
  // a path. A name it no longer exports fails loudly below.
  const exportedAt = new Map<string, string>();
  for (const statement of barrel.matchAll(
    /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
  )) {
    if (!statement[2].startsWith(".")) continue;
    const file = path.resolve(esmDir, statement[2]);
    for (const raw of statement[1].split(",")) {
      const entry = raw.trim().replace(/^type\s+/, "");
      if (!entry) continue;
      const exported =
        entry
          .split(/\s+as\s+/)
          .pop()
          ?.trim() ?? entry;
      exportedAt.set(exported, file);
    }
  }

  for (const name of MANTINE_TOOL_ONLY_COMPONENTS) {
    const file = exportedAt.get(name);
    if (!file || !file.startsWith(componentRoot) || !existsSync(file)) {
      throw new Error(
        `mantine-tool-only-imports: @mantine/core no longer exports ${name} from a component ` +
          `directory (resolved ${file ?? "nothing"}); check the package layout and update ` +
          "MANTINE_TOOL_ONLY_COMPONENTS",
      );
    }
    mantineToolOnlyImplementations.set(name, file);
    const family = file.slice(componentRoot.length).split("/")[0];
    mantineToolOnlyFamilies.set(`${componentRoot}${family}/`, family);
  }

  let appDir: string | undefined;

  return {
    name: "mantine-tool-only-imports",
    apply: "build" as const,
    configResolved(config) {
      appDir = `${resolve(config.root, "src")}/`;
    },
    generateBundle(_options, bundle) {
      // A moved family that a startup chunk still imports lands back in the
      // preload set, and the two chunks importing each other let the browser
      // execute a module before its dependency: the app dies with
      // "Cannot access 'x' before initialization". Fail the build instead.
      const names = new Set(
        Object.values(bundle)
          .filter((file) => file.type === "chunk")
          .map((file) => file.fileName),
      );
      const imports = new Map<string, string[]>();
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk")
          imports.set(
            file.fileName,
            file.imports.filter((target) => names.has(target)),
          );
      }
      const visiting = new Set<string>();
      const done = new Set<string>();
      const trail: string[] = [];
      const visit = (name: string): void => {
        if (done.has(name)) return;
        if (visiting.has(name)) {
          throw new Error(
            `mantine-tool-only-imports: chunks import each other in a cycle ` +
              `(${[...trail.slice(trail.indexOf(name)), name].join(" -> ")}); ` +
              "a component family a startup chunk reaches has to stay in vendor-ui",
          );
        }
        visiting.add(name);
        trail.push(name);
        for (const target of imports.get(name) ?? []) visit(target);
        trail.pop();
        visiting.delete(name);
        done.add(name);
      };
      for (const name of imports.keys()) visit(name);

      // The engine is a megabyte the browser downloads before the app runs if
      // anything a startup chunk statically imports pulls it in: every static
      // import of an entry becomes a modulepreload. Only the opened viewer
      // needs it; pdfium's url glue and the shared enums stay in their own
      // chunks and are small enough to keep.
      const eager = new Set<string>();
      const reach = (name: string): void => {
        if (eager.has(name)) return;
        eager.add(name);
        for (const target of imports.get(name) ?? []) reach(target);
      };
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk" && file.isEntry) reach(file.fileName);
      }
      const eagerEngine = [...eager].filter((name) =>
        /^vendor-embedpdf(-core)?-/.test(name),
      );
      if (eagerEngine.length) {
        throw new Error(
          `startup chunks statically reach the pdf engine (${eagerEngine.join(", ")}); ` +
            "the browser would preload it before the app runs, so keep the engine " +
            "behind a dynamic import",
        );
      }
    },
    transform(code, id) {
      if (!appDir || !id.startsWith(appDir) || !code.includes("@mantine/core"))
        return null;
      let cursor = 0;
      let rewritten = "";
      for (const node of this.parse(code).body) {
        if (
          node.type !== "ImportDeclaration" ||
          node.source.value !== "@mantine/core"
        )
          continue;
        const moved: Array<{
          specifier: (typeof node.specifiers)[number];
          file: string;
        }> = [];
        const staying: Array<(typeof node.specifiers)[number]> = [];
        for (const specifier of node.specifiers) {
          const file =
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier"
              ? mantineToolOnlyImplementations.get(specifier.imported.name)
              : undefined;
          if (file) moved.push({ specifier, file });
          else staying.push(specifier);
        }
        if (moved.length === 0) continue;
        rewritten += code.slice(cursor, node.start);
        cursor = node.end;
        if (staying.length > 0) {
          rewritten += `import { ${staying
            .map((specifier) => code.slice(specifier.start, specifier.end))
            .join(", ")} } from "@mantine/core";\n`;
        }
        for (const { specifier, file } of moved) {
          rewritten += `import { ${code.slice(specifier.start, specifier.end)} } from "${file}";\n`;
        }
      }
      if (cursor === 0) return null;
      return { code: rewritten + code.slice(cursor), map: null };
    },
  };
}

/**
 *
 * The Open Graph pages, the route hints, the landing shell and the precompressed
 * siblings all rewrite or derive from the same documents. As separate plugins
 * their `closeBundle` hooks ran in parallel, so a hint could be overwritten by a
 * later template and a `.br` sibling could describe an older copy than the HTML
 * beside it; `enforce: "post"` orders plugins in the array, not their async
 * hooks. One hook running the passes in order is the ordering that was wanted.
 */
function htmlOutputPlugin(options: {
  routeChunk: string;
  isSaas: boolean;
  precompress: boolean;
}): PluginOption {
  const { routeChunk, isSaas, precompress } = options;
  let distDir: string | undefined;
  let editorDir: string | undefined;
  let route: { js: string; css: string[] } | undefined;

  return {
    name: "html-output",
    apply: "build" as const,
    enforce: "post" as const,
    configResolved(config) {
      // `outDir` is whatever the config said (the CLI's root is relative here),
      // and the capture needs the source tree for its stub helper either way.
      distDir = resolve(config.root, config.build.outDir);
      editorDir = config.root;
    },
    writeBundle(_output: Rollup.OutputOptions, bundle: Rollup.OutputBundle) {
      const chunk = Object.values(bundle).find(
        (file): file is Rollup.OutputChunk =>
          file.type === "chunk" &&
          file.isDynamicEntry &&
          file.name === routeChunk,
      );
      if (chunk)
        route = {
          js: chunk.fileName,
          css: [...(chunk.viteMetadata?.importedCss ?? [])],
        };
    },
    async closeBundle() {
      if (!distDir) return;
      await writeOpenGraphPages(distDir, isSaas);
      if (route) await writeRouteHints(distDir, route);
      if (editorDir) await writeLandingShell(distDir, editorDir);
      if (precompress) await compressHtmlOutput(distDir);
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
const VALID_MODES = ["core", "proprietary", "saas", "desktop"] as const;
type BuildMode = (typeof VALID_MODES)[number];

const TSCONFIG_MAP: Record<BuildMode, string> = {
  core: "./tsconfig.core.vite.json",
  proprietary: "./tsconfig.proprietary.vite.json",
  saas: "./tsconfig.saas.vite.json",
  desktop: "./tsconfig.desktop.vite.json",
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
      ? flavor
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
  // in CI/E2E) so the live test suite still resolves /api → :8080. /fonts is
  // deliberately absent: the stubbed suite runs backend-free and proxying font
  // requests would turn a static 404 into a connection error.
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
      mantineToolOnlyImports(),
      ...(runSubpath ? [subpathBareRedirectPlugin(runSubpath)] : []),
      tsconfigPaths({
        projects: [tsconfigProject],
      }),
      localeAssetsPlugin(),
      // Desktop/mobile output is embedded in the Tauri binary, which brotli-
      // compresses every asset itself and never negotiates encodings, so the
      // .br/.gz siblings would only add their full size (tens of MB) to the
      // bundle. Web flavours keep both encodings for the HTTP server.
      ...(effectiveMode === "desktop"
        ? []
        : [
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
          ]),
      // ANALYZE=true emits dist/stats.json; the visualizer is ESM-only, hence
      // the dynamic import.
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
            // Brand assets live in core; the editor serves them by URL, so
            // copy the set to the /modern-logo path its manifest, index.html
            // and useLogoAssets resolve against.
            src: "src/core/assets/brand/modern-logo/*",
            dest: "modern-logo",
          },
          // The compression pass writes the .br/.gz siblings the backend JAR
          // serves from classpath:/static/fonts/; desktop is embedded and gets
          // them from the bundled backend instead.
          ...(effectiveMode === "desktop"
            ? []
            : [
                {
                  src: "../../app/core/src/main/resources/static/fonts/*.ttf",
                  dest: "fonts",
                },
              ]),
        ],
      }),
      ...(effectiveMode === "desktop" ? [] : [compressStaticCopyPlugin()]),
      htmlOutputPlugin({
        routeChunk: "Landing",
        isSaas: effectiveMode === "saas",
        precompress: effectiveMode !== "desktop",
      }),
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
      modulePreload: {
        // Lazy chunks can import the entry again. An upfront link lets Vite reuse
        // its preload instead of fetching an already-running module in WebKit.
        resolveDependencies: (filename, deps, { hostType }) =>
          hostType === "html" ? [filename, ...deps] : deps,
      },
      // The real precompression runs below, so Vite's gzip measurement is
      // wasted CI time.
      reportCompressedSize: false,
      // Minifies better than esbuild for this esnext target.
      cssMinify: "lightningcss" as const,
      rollupOptions: {
        output: {
          assetFileNames: mjsToJsAssetFileNames,
          manualChunks(id: string, meta: ManualChunkMeta) {
            if (id.includes("material-symbols-icons.json"))
              return "vendor-iconset";
            // An asset URL import compiles to a single string. Filed by package
            // name it joins that package's vendor chunk, and its importer then
            // loads the whole chunk: the startup WASM warm-up imports pdfium's
            // URL, which would pull all of embedpdf into the initial load.
            if (id.includes("?url")) return undefined;
            // Left to Rollup, this lands in the first dynamic-importing vendor
            // chunk and the entry then statically imports that whole chunk.
            if (id.includes("vite/preload-helper")) return "vendor-preload";

            const pkg = packageNameOf(id);
            if (!pkg) return undefined;

            if (pkg === "pdfjs-dist") return "vendor-pdfjs";
            // Only the lazily opened viewer needs the engine and the plugins;
            // the startup graph needs just the pdfium glue and the shared
            // enums, so they get their own chunks.
            if (pkg === "@embedpdf/engines") return "vendor-embedpdf";
            if (pkg === "@embedpdf/pdfium") return "vendor-pdfium";
            // models is the only embedpdf package the startup path imports
            // (PdfPermissionFlag), so grouping it with core/utils/plugins
            // preloads the engine for one enum.
            if (pkg === "@embedpdf/models") return "vendor-embedpdf-models";
            if (
              pkg === "@embedpdf/core" ||
              pkg === "@embedpdf/utils" ||
              pkg === "@embedpdf/plugin-spread"
            ) {
              return "vendor-embedpdf-core";
            }
            if (inScope(pkg, "@embedpdf")) return "vendor-embedpdf";
            // Without its own chunk the portal's static import drags the
            // markdown pipeline into vendor-ui, which the editor preloads.
            if (isMarkdownPackage(pkg)) return "vendor-markdown";
            // Splitting these out keeps icon changes from invalidating all of
            // vendor-ui.
            if (pkg === "@mui/icons-material") return "vendor-mui-icons";
            if (pkg === "@iconify/react") return "vendor-iconify";
            // Only lazy screens import these (DataTable, reached through the
            // ui barrel), but the substring match on "react" below would file
            // them with the startup modules.
            if (
              pkg === "@tanstack/react-table" ||
              pkg === "@tanstack/table-core"
            ) {
              return "vendor-tanstack-table";
            }
            // A component family only lazy screens open, in its own chunk, so
            // the preloaded chunk stops carrying it; see
            // `mantineToolOnlyImports`.
            const toolOnly = mantineToolOnlyChunk(id);
            if (toolOnly) return toolOnly;
            // react-number-format is imported by NumberInput and NumberFormatter
            // and nothing else, so it travels with the NumberInput family rather
            // than with the preloaded chunk.
            if (pkg === "react-number-format")
              return "vendor-mantine-NumberInput";
            // These packages are mutually circular: splitting them breaks
            // module init order at runtime. Only startup modules land in
            // vendor-ui; libraries only some screens use (the markdown
            // renderer, the date pickers) go with the screens that import them.
            if (
              pkg.includes("react") ||
              pkg === "scheduler" ||
              inScope(pkg, "@mantine") ||
              inScope(pkg, "@mui") ||
              inScope(pkg, "@emotion") ||
              inScope(pkg, "@iconify")
            ) {
              return startupModules(meta).has(id) ? "vendor-ui" : undefined;
            }
            if (inScope(pkg, "@supabase")) return "vendor-supabase";
            if (pkg === "posthog-js" || inScope(pkg, "@posthog"))
              return "vendor-posthog";
            if (pkg === "@cantoo/pdf-lib" || pkg === "pdf-lib")
              return "vendor-pdflib";
            if (
              pkg === "recharts" ||
              pkg === "d3" ||
              pkg.startsWith("d3-") ||
              pkg === "decimal.js"
            ) {
              return "vendor-charts";
            }
            if (pkg === "jszip" || pkg === "pako") return "vendor-zip";
            if (pkg.includes("i18next")) return "vendor-i18n";
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
