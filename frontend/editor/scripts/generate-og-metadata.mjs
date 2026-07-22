// Generates Open Graph (OG) / SEO social-preview metadata from the single
// source of truth in the frontend (tool ids, URL aliases, translated English
// strings) plus the actual images in public/og_images.
//
// Outputs:
//   src/core/data/ogImageMap.json  - { toolId: imageBasename }  (imported by the client)
//   public/og-metadata.json        - { default, byTool, byPath } (prerender input, all flavors)
//   public/og-metadata.saas.json   - same shape, SaaS marketing copy/art (prerender input, --mode saas)
//
// Run: `node scripts/generate-og-metadata.mjs`        (writes files)
//      `node scripts/generate-og-metadata.mjs --check` (CI drift guard: fails if stale)
//
// Why a generator instead of hand-maintained JSON: tool ids, URL aliases and
// English copy already live in the codebase. Regenerating keeps OG metadata in
// lockstep with the tool registry and surfaces tools that have no art.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const SITE_NAME = "Stirling PDF";
const SITE_TITLE = "Stirling PDF";
const SITE_DESC = "The Free Adobe Acrobat alternative (10M+ Downloads)";
const DEFAULT_IMAGE_BASENAME = "home";

// SaaS (stirling.com) link-preview cards. Only the SaaS build (`--mode saas`)
// uses og-metadata.saas.json; every other flavour keeps the tool-registry copy
// above. `ogTitle` is the punchy social headline; `title` is the SEO <title>.
// `home` overrides the site default (served at `/app`); the rest are extra
// marketing landing routes prerendered so their links unfurl with bespoke art.
const SAAS_DEFAULT = {
  image: "/og_images/saas/app.png",
  title: "Stirling - Edit any PDF. Govern every PDF.",
  ogTitle: "Edit any PDF. Govern every PDF.",
  description:
    "The free, open-source PDF Editor, plus a Processor that governs every PDF your organization touches. 1¢ per PDF.",
};
const SAAS_ROUTE_OVERRIDES = {
  "/processor": {
    image: "/og_images/saas/app-processor.png",
    title: "Stirling Processor - Govern every PDF your organization touches",
    ogTitle: "Govern every PDF your organization touches",
    description:
      "Redaction, retention, and encryption policies enforced everywhere PDFs enter your org. Distribute the free Editor anywhere. 1¢ per PDF.",
  },
  "/editor": {
    image: "/og_images/saas/app-editor.png",
    title: "Stirling - The world's most secure PDF editor",
    ogTitle: "The world's most secure PDF editor",
    description:
      "Edit, sign, redact, and convert PDFs in your browser. Free forever, open source, and self-hostable.",
  },
};

// Tools whose art exists under a legacy v1 filename that does not match the
// tool id or any current URL slug. Verified against public/og_images contents.
const LEGACY_IMAGE_OVERRIDES = {
  merge: "mergePdfs",
  crop: "cropPdf",
  getPdfInfo: "get-all-info-on-pdf",
  validateSignature: "validate-pdf-signature",
  replaceColor: "replace-and-invert-color",
  scalePages: "adjust-page-size-scale",
  adjustContrast: "adjust-colors-contrast",
  autoRename: "auto-rename-pdf-file",
  removeBlanks: "remove-blank-pages",
  removePages: "remove",
  scannerImageSplit: "detect-split-scanned-photos",
};

// --- parse tool ids ---------------------------------------------------------
const idSrc = read("src/core/types/toolId.ts");
function idArray(name) {
  const m = idSrc.match(
    new RegExp("export const " + name + " = \\[([\\s\\S]*?)\\] as const"),
  );
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}
const regularIds = idArray("CORE_REGULAR_TOOL_IDS");
const superIds = idArray("CORE_SUPER_TOOL_IDS");
const linkIds = idArray("CORE_LINK_TOOL_IDS");
const allIds = [...regularIds, ...superIds, ...linkIds];

// --- parse URL aliases ------------------------------------------------------
const mapSrc = read("src/core/utils/urlMapping.ts");
const urlToTool = {};
for (const m of mapSrc.matchAll(/"([^"]+)":\s*"([^"]+)"/g))
  urlToTool[m[1]] = m[2];

// --- parse English title/description fallbacks ------------------------------
const regSrc = read("src/core/data/useTranslatedToolRegistry.tsx");
const titleById = {};
const descById = {};
const STR = '"((?:[^"\\\\]|\\\\.)*)"';
for (const m of regSrc.matchAll(
  new RegExp('t\\(\\s*"home\\.([A-Za-z0-9_]+)\\.title"\\s*,\\s*' + STR, "g"),
))
  titleById[m[1]] = m[2];
for (const m of regSrc.matchAll(
  new RegExp('t\\(\\s*"home\\.([A-Za-z0-9_]+)\\.desc"\\s*,\\s*' + STR, "g"),
))
  descById[m[1]] = m[2];

// --- available images -------------------------------------------------------
const imageDir = "public/og_images";
const images = new Set(
  fs
    .readdirSync(path.join(ROOT, imageDir))
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.replace(/\.png$/, "")),
);

const canonicalPath = (id) => "/" + id.replace(/([A-Z])/g, "-$1").toLowerCase();
const aliasesByTool = {};
for (const [p, id] of Object.entries(urlToTool))
  (aliasesByTool[id] ??= []).push(p);

function resolveImage(id) {
  const override = LEGACY_IMAGE_OVERRIDES[id];
  if (override) return images.has(override) ? override : null;
  const candidates = [
    id,
    canonicalPath(id).slice(1),
    ...(aliasesByTool[id] || []).map((a) => a.slice(1)),
  ];
  for (const c of candidates) if (images.has(c)) return c;
  return null;
}

const humanize = (id) =>
  id
    .replace(/([A-Z]+)/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
const titleFor = (id) => `${titleById[id] || humanize(id)} - ${SITE_NAME}`;
const descFor = (id) => descById[id] || SITE_DESC;

// --- build outputs ----------------------------------------------------------
const ogImageMap = {}; // toolId -> basename (only tools with art)
const byTool = {};
const missing = [];
for (const id of allIds) {
  const img = resolveImage(id);
  if (img) ogImageMap[id] = img;
  else missing.push(id);
  byTool[id] = {
    image: `/og_images/${img || DEFAULT_IMAGE_BASENAME}.png`,
    title: titleFor(id),
    description: descFor(id),
  };
}

// path -> toolId for every canonical path and every alias
const byPath = {};
for (const id of allIds) byPath[canonicalPath(id)] = id;
for (const [p, id] of Object.entries(urlToTool)) byPath[p] = id;

// --- non-tool application routes --------------------------------------------
// Every other URL the SPA serves also gets OG: auth, the file manager, the
// mobile scanner, and each settings section. These have no bespoke art (default
// image) but carry a page-specific title so shared links are labelled correctly.
// Keyed by path (tool ids never start with "/", so there is no collision).
const navKeys = (
  read("src/core/components/shared/config/types.ts")
    .match(/export const VALID_NAV_KEYS = \[([\s\S]*?)\] as const/)?.[1]
    .match(/"([^"]+)"/g) || []
).map((s) => s.replace(/"/g, ""));

const humanizeLabel = (s) =>
  s
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const pageTitles = {
  "/login": "Sign In",
  "/signup": "Sign Up",
  "/mobile-scanner": "Mobile Scanner",
  "/files": "Files",
  "/settings": "Settings",
};
for (const key of navKeys)
  pageTitles[`/settings/${key}`] = `${humanizeLabel(key)} Settings`;

for (const [routePath, label] of Object.entries(pageTitles)) {
  byTool[routePath] = {
    image: `/og_images/${DEFAULT_IMAGE_BASENAME}.png`,
    title: `${label} - ${SITE_NAME}`,
    description: SITE_DESC,
  };
  byPath[routePath] = routePath;
}

const manifest = {
  default: {
    image: `/og_images/${DEFAULT_IMAGE_BASENAME}.png`,
    title: SITE_TITLE,
    description: SITE_DESC,
  },
  byTool,
  byPath,
};

// SaaS manifest: same tool pages as above, but the home default and two extra
// marketing routes carry the stirling.com cards. Keeps all per-tool OG intact.
const saasManifest = {
  default: SAAS_DEFAULT,
  byTool: { ...byTool },
  byPath: { ...byPath },
};
for (const [routePath, entry] of Object.entries(SAAS_ROUTE_OVERRIDES)) {
  saasManifest.byTool[routePath] = entry;
  saasManifest.byPath[routePath] = routePath;
}
// SaaS card art lives in the saas/ subdir (outside the root images scan), so
// check the files on disk directly.
const missingSaasImages = [SAAS_DEFAULT, ...Object.values(SAAS_ROUTE_OVERRIDES)]
  .map((e) => e.image)
  .filter((img) => !fs.existsSync(path.join(ROOT, "public" + img)));
if (missingSaasImages.length)
  console.warn(
    `\nWARNING: SaaS OG cards reference missing images: ${missingSaasImages.join(", ")}`,
  );

const mapJson = JSON.stringify(ogImageMap, null, 2) + "\n";
const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
const saasManifestJson = JSON.stringify(saasManifest, null, 2) + "\n";
const mapPath = "src/core/data/ogImageMap.json";
const manifestPath = "public/og-metadata.json";
const saasManifestPath = "public/og-metadata.saas.json";

const check = process.argv.includes("--check");
if (check) {
  const stale = [];
  if (!fs.existsSync(path.join(ROOT, mapPath)) || read(mapPath) !== mapJson)
    stale.push(mapPath);
  if (
    !fs.existsSync(path.join(ROOT, manifestPath)) ||
    read(manifestPath) !== manifestJson
  )
    stale.push(manifestPath);
  if (
    !fs.existsSync(path.join(ROOT, saasManifestPath)) ||
    read(saasManifestPath) !== saasManifestJson
  )
    stale.push(saasManifestPath);
  if (stale.length) {
    console.error(
      "OG metadata is stale. Run `node scripts/generate-og-metadata.mjs`:\n  " +
        stale.join("\n  "),
    );
    process.exit(1);
  }
  console.log("OG metadata is up to date.");
} else {
  fs.writeFileSync(path.join(ROOT, mapPath), mapJson);
  fs.writeFileSync(path.join(ROOT, manifestPath), manifestJson);
  fs.writeFileSync(path.join(ROOT, saasManifestPath), saasManifestJson);
  console.log(
    `Wrote ${mapPath} (${Object.keys(ogImageMap).length} tools with art)`,
  );
  console.log(
    `Wrote ${saasManifestPath} (${Object.keys(saasManifest.byPath).length} paths, SaaS)`,
  );
  console.log(`Wrote ${manifestPath} (${Object.keys(byPath).length} paths)`);
}

// --- report -----------------------------------------------------------------
console.log(
  `\nTools with OG image: ${allIds.length - missing.length}/${allIds.length}`,
);
console.log(
  `Tools using the DEFAULT image (${DEFAULT_IMAGE_BASENAME}.png) - no bespoke art: ${missing.length}`,
);
for (const id of missing) {
  const kind = superIds.includes(id)
    ? "super"
    : linkIds.includes(id)
      ? "link"
      : "regular";
  console.log(`  ${kind.padEnd(8)} ${id.padEnd(20)} ${canonicalPath(id)}`);
}
const used = new Set(Object.values(ogImageMap));
const orphans = [...images]
  .filter((i) => !used.has(i) && i !== DEFAULT_IMAGE_BASENAME)
  .sort();
console.log(
  `\nUnused images in ${imageDir} (${orphans.length}): ${orphans.join(", ")}`,
);
