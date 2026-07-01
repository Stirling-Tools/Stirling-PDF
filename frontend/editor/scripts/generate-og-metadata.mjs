// Generates Open Graph (OG) / SEO social-preview metadata from the single
// source of truth in the frontend (tool ids, URL aliases, translated English
// strings) plus the actual images in public/og_images.
//
// Outputs:
//   src/core/data/ogImageMap.json  - { toolId: imageBasename }  (imported by the client)
//   public/og-metadata.json        - { default, byTool, byPath } (read by the backend at startup)
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

// Keyword-targeted landing copy for the convert tool's URL aliases. Every
// /pdf-to-x and /x-to-pdf path routes to the single `convert` tool, so without
// this they would all share the generic "Convert - Stirling PDF" title and
// description - duplicate content that ranks for nothing. Each entry gets its
// own crawlable title/description (prerendered) and a client-side override so
// the SPA keeps the same title after hydration. `name` is the keyword phrase;
// the app suffix (" - Stirling PDF" / the instance name) is added per surface.
const CONVERT_SEO_PAGES = {
  "/pdf-to-word": {
    name: "PDF to Word Converter",
    description:
      "Convert PDF files into editable Microsoft Word (DOCX) documents. Free, fast, and private - no signup or email required.",
  },
  "/pdf-to-xlsx": {
    name: "PDF to Excel Converter",
    description:
      "Convert PDF tables into editable Microsoft Excel (XLSX) spreadsheets. Free, fast, and private.",
  },
  "/pdf-to-csv": {
    name: "PDF to CSV Converter",
    description:
      "Extract tables from PDF files into CSV data. Free, fast, and private - no signup required.",
  },
  "/pdf-to-img": {
    name: "PDF to Image Converter",
    description:
      "Convert PDF pages into high-quality JPG or PNG images. Free and private, right in your browser.",
  },
  "/pdf-to-presentation": {
    name: "PDF to PowerPoint Converter",
    description:
      "Convert PDF files into editable PowerPoint (PPTX) presentations. Free, fast, and private.",
  },
  "/pdf-to-text": {
    name: "PDF to Text Converter",
    description:
      "Extract plain text from PDF documents. Free, fast, and private - no signup or email required.",
  },
  "/pdf-to-markdown": {
    name: "PDF to Markdown Converter",
    description:
      "Convert PDF documents into clean Markdown text. Free and private, right in your browser.",
  },
  "/pdf-to-html": {
    name: "PDF to HTML Converter",
    description:
      "Convert PDF documents into HTML web pages. Free and private, right in your browser.",
  },
  "/pdf-to-xml": {
    name: "PDF to XML Converter",
    description:
      "Convert PDF documents into structured XML. Free, fast, and private.",
  },
  "/pdf-to-pdfa": {
    name: "PDF to PDF/A Converter",
    description:
      "Convert PDFs to the PDF/A archival standard for long-term preservation. Free and private.",
  },
  "/img-to-pdf": {
    name: "Image to PDF Converter",
    description:
      "Convert JPG, PNG, and other images into a single PDF document. Free, fast, and private.",
  },
  "/html-to-pdf": {
    name: "HTML to PDF Converter",
    description:
      "Convert HTML files and web pages into PDF documents. Free, fast, and private.",
  },
  "/markdown-to-pdf": {
    name: "Markdown to PDF Converter",
    description:
      "Convert Markdown files into polished PDF documents. Free and private, right in your browser.",
  },
  "/eml-to-pdf": {
    name: "Email (EML) to PDF Converter",
    description:
      "Convert email (EML) files into PDF documents. Free, fast, and private - no signup required.",
  },
  "/file-to-pdf": {
    name: "File to PDF Converter",
    description:
      "Convert Word, Excel, PowerPoint, and more into PDF documents. Free, fast, and private.",
  },
  "/cbr-to-pdf": {
    name: "CBR to PDF Converter",
    description:
      "Convert CBR comic book archives into PDF documents. Free and private, right in your browser.",
  },
  "/pdf-to-cbr": {
    name: "PDF to CBR Converter",
    description:
      "Convert PDF documents into CBR comic book archives. Free and private.",
  },
  "/cbz-to-pdf": {
    name: "CBZ to PDF Converter",
    description:
      "Convert CBZ comic book archives into PDF documents. Free and private.",
  },
  "/pdf-to-cbz": {
    name: "PDF to CBZ Converter",
    description:
      "Convert PDF documents into CBZ comic book archives. Free and private.",
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

// Auth, file manager, scanner and settings are app surfaces, not landing pages:
// mark them noindex so crawlers keep them out of the index (and the sitemap).
for (const [routePath, label] of Object.entries(pageTitles)) {
  byTool[routePath] = {
    image: `/og_images/${DEFAULT_IMAGE_BASENAME}.png`,
    title: `${label} - ${SITE_NAME}`,
    description: SITE_DESC,
    noindex: true,
  };
  byPath[routePath] = routePath;
}

// --- convert-alias SEO landing pages -----------------------------------------
// Give each convert alias its own keyword title/description instead of the
// generic "Convert" entry. Self-key in byPath so the prerender treats it as a
// distinct (self-canonical) page. `urlSeoOverrides` feeds the same copy to the
// running SPA so the hydrated title matches what crawlers first see.
const convertImage =
  byTool.convert?.image ?? `/og_images/${DEFAULT_IMAGE_BASENAME}.png`;
const urlSeoOverrides = {};
for (const [routePath, seo] of Object.entries(CONVERT_SEO_PAGES)) {
  byTool[routePath] = {
    image: convertImage,
    title: `${seo.name} - ${SITE_NAME}`,
    description: seo.description,
  };
  byPath[routePath] = routePath;
  urlSeoOverrides[routePath] = {
    title: seo.name,
    description: seo.description,
  };
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

const mapJson = JSON.stringify(ogImageMap, null, 2) + "\n";
const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
const seoOverridesJson = JSON.stringify(urlSeoOverrides, null, 2) + "\n";
const mapPath = "src/core/data/ogImageMap.json";
const manifestPath = "public/og-metadata.json";
const seoOverridesPath = "src/core/data/urlSeoOverrides.json";

const outputs = [
  [mapPath, mapJson],
  [manifestPath, manifestJson],
  [seoOverridesPath, seoOverridesJson],
];

const check = process.argv.includes("--check");
if (check) {
  const stale = outputs
    .filter(
      ([p, content]) =>
        !fs.existsSync(path.join(ROOT, p)) || read(p) !== content,
    )
    .map(([p]) => p);
  if (stale.length) {
    console.error(
      "OG metadata is stale. Run `node scripts/generate-og-metadata.mjs`:\n  " +
        stale.join("\n  "),
    );
    process.exit(1);
  }
  console.log("OG metadata is up to date.");
} else {
  for (const [p, content] of outputs)
    fs.writeFileSync(path.join(ROOT, p), content);
  console.log(
    `Wrote ${mapPath} (${Object.keys(ogImageMap).length} tools with art)`,
  );
  console.log(`Wrote ${manifestPath} (${Object.keys(byPath).length} paths)`);
  console.log(
    `Wrote ${seoOverridesPath} (${Object.keys(urlSeoOverrides).length} SEO landing pages)`,
  );
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
