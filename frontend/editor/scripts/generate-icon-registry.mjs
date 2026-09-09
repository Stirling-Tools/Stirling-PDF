#!/usr/bin/env node
/** Bundles all of lucide, plus every svg in both icon dirs, into the
 * *.generated.ts registry. `--check` fails instead of writing when the
 * committed output is stale. */
import fs from "node:fs";
import path from "node:path";
// oxlint-disable-next-line no-restricted-imports -- build script; no alias covers scripts/
import { STROKE_WIDTH, DEFAULT_SIZE } from "../src/core/icons/icons.config.mjs";
// oxlint-disable-next-line no-restricted-imports -- build script; no alias covers scripts/
import { inkBounds } from "../src/core/icons/svgInkBounds.mjs";

const EDITOR = path.join(import.meta.dirname, "..");
const SRC = path.join(EDITOR, "src");
const ICONS_DIR = path.join(SRC, "core/icons");
const LUCIDE = path.join(
  EDITOR,
  "../node_modules/lucide-static/icon-nodes.json",
);

const verbose = process.argv.includes("--verbose");
const check = process.argv.includes("--check");
const log = (m) => console.log(m);
const debug = (m) => verbose && console.log(m);

// React needs camelCase for the SVG attributes it knows about. Anything not
// listed passes through unchanged (React forwards unknown attributes as-is).
const ATTR_CASE = {
  "clip-path": "clipPath",
  "clip-rule": "clipRule",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-miterlimit": "strokeMiterlimit",
  "stroke-opacity": "strokeOpacity",
  "stroke-width": "strokeWidth",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "text-anchor": "textAnchor",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  gradientUnits: "gradientUnits",
  "xlink:href": "xlinkHref",
};

const DROP_ATTRS = new Set(["xmlns", "xmlns:xlink", "class", "version"]);

const camelAttrs = (attrs) =>
  Object.fromEntries(
    Object.entries(attrs)
      .filter(([k]) => !DROP_ATTRS.has(k))
      .map(([k, v]) => [ATTR_CASE[k] || k, v]),
  );

function parseAttrs(src) {
  // Only double-quoted values are read; a single-quoted one would otherwise
  // vanish silently and leave a blank (and mis-detected mono) icon.
  if (/=\s*'/.test(src))
    throw new Error(`single-quoted svg attribute in: ${src.trim()}`);
  const out = {};
  for (const m of src.matchAll(/([:a-zA-Z_][-:.\w]*)\s*=\s*"([^"]*)"/g))
    out[m[1]] = m[2];
  return camelAttrs(out);
}

/** Parse an svg fragment into nested [tag, attrs, children?] tuples. */
function parseNodes(src) {
  const nodes = [];
  const stack = [nodes];
  const re = /<(\/)?([a-zA-Z][\w:-]*)((?:\s+[^>]*?)?)(\/)?>|<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[0].startsWith("<!--")) continue;
    const [, closing, tag, attrSrc, selfClosing] = m;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = [tag, parseAttrs(attrSrc || "")];
    stack.at(-1).push(node);
    if (!selfClosing) {
      node.push([]);
      stack.push(node[2]);
    }
  }
  // strip the empty children arrays we speculatively added
  const prune = (list) => {
    for (const n of list) {
      if (n[2]) {
        if (n[2].length) prune(n[2]);
        else n.length = 2;
      }
    }
  };
  prune(nodes);
  return nodes;
}

/** Namespaces declared ids so two bundled icons cannot collide on
 * `url(#clip0_…)` once both are mounted. */
function namespaceIds(nodes, prefix) {
  const walk = (list) => {
    for (const node of list) {
      const attrs = node[1];
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "id") attrs[k] = `${prefix}-${v}`;
        else if (typeof v === "string" && v.includes("url(#"))
          attrs[k] = v.replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
      }
      if (node[2]) walk(node[2]);
    }
  };
  walk(nodes);
  return nodes;
}

/** True if any node paints a literal colour rather than currentColor/none. */
function hasLiteralColour(nodes) {
  const paints = ["fill", "stroke", "stopColor", "floodColor"];
  const walk = (list) =>
    list.some(
      (node) =>
        paints.some((p) => {
          const v = node[1][p];
          return (
            v && v !== "none" && v !== "currentColor" && !v.startsWith("url(")
          );
        }) || (node[2] ? walk(node[2]) : false),
    );
  return walk(nodes);
}

/** A licence notice an svg carries in a leading comment, if any. */
function readSvgNotice(raw) {
  const m = raw.match(/<!--([\s\S]*?)-->/);
  return m && /Licen[cs]e/i.test(m[1]) ? m[1].trim() : null;
}

function readSvgFile(file, name) {
  const raw = fs.readFileSync(file, "utf8");
  const open = raw.match(/<svg\b([^>]*)>/);
  if (!open) throw new Error(`${file}: no <svg> root`);
  if (/<style\b/.test(raw))
    throw new Error(
      `${file}: <style> is not bundled; use presentation attributes`,
    );
  const rootAttrs = parseAttrs(open[1]);
  const inner = raw.slice(
    open.index + open[0].length,
    raw.lastIndexOf("</svg>"),
  );
  const width = rootAttrs.width || "24";
  const height = rootAttrs.height || "24";
  return {
    viewBox: rootAttrs.viewBox || `0 0 ${width} ${height}`,
    nodes: namespaceIds(parseNodes(inner), name),
  };
}

const lucideNodes = JSON.parse(fs.readFileSync(LUCIDE, "utf8"));

function lucideVersion() {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(EDITOR, "../node_modules/lucide-static/package.json"),
        "utf8",
      ),
    ).version;
  } catch {
    return "?";
  }
}

// Notices from svgs whose geometry is not entirely ours. Minifiers keep a
// comment marked @license, so this is what carries them into the bundle.
const notices = new Map();

// Brand art arrives on whatever grid its owner drew it on (googledrive is
// 87.3x78, dropbox 16x16, our own drawings sit inset on a 24 grid), and
// filling a square box makes it out-scale the stroke icons beside it. Each
// mark is measured by what it paints and mapped onto the 24 grid's 20-unit ink
// box, so the padding in the source file never reaches the app.
const GRID = 24;
const INK = 20;

function normaliseToGrid(nodes, label) {
  const box = inkBounds(nodes);
  if (!box) throw new Error(`${label}: draws nothing`);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w <= 0 && h <= 0) throw new Error(`${label}: ink has no extent`);
  const round = (n) => Number(n.toFixed(4));
  const scale = INK / Math.max(w, h);
  const tx = round((GRID - w * scale) / 2 - box.minX * scale);
  const ty = round((GRID - h * scale) / 2 - box.minY * scale);
  const transform = `translate(${tx} ${ty}) scale(${round(scale)})`;
  return {
    viewBox: `0 0 ${GRID} ${GRID}`,
    nodes: [["g", { transform }, nodes]],
  };
}

function collectCustom(dir, { normalise = false } = {}) {
  const abs = path.join(ICONS_DIR, "svg", dir);
  if (!fs.existsSync(abs)) return {};
  const out = {};
  for (const file of fs.readdirSync(abs).sort()) {
    if (!file.endsWith(".svg")) continue;
    const name = path.basename(file, ".svg");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name))
      throw new Error(`${dir}/${file}: icon file names must be kebab-case`);
    const raw = fs.readFileSync(path.join(abs, file), "utf8");
    const notice = readSvgNotice(raw);
    if (notice) notices.set(name, notice);
    const read = readSvgFile(path.join(abs, file), name);
    const { viewBox, nodes } = normalise
      ? normaliseToGrid(read.nodes, `${dir}/${file}`)
      : read;
    out[name] = {
      viewBox,
      nodes,
      // Read from the geometry, so a new brand svg needs no config.
      mono: !hasLiteralColour(nodes),
    };
    debug(`  ${dir}/${name}`);
  }
  return out;
}

const stirling = collectCustom("stirling");
const thirdParty = collectCustom("third-party", { normalise: true });

const customNames = new Set([
  ...Object.keys(stirling),
  ...Object.keys(thirdParty),
]);

// All of lucide, not the subset the app happens to reference today. Subsetting
// meant grepping source for names, so a name assembled at runtime was absent
// from the bundle and rendered the placeholder with nothing failing first; the
// set also churned whenever an unrelated file gained or lost a literal. The
// whole set is ~65KB brotli in its own chunk, which buys IconName covering
// every lucide icon: an unknown name is a compile error, everywhere.
const lucideTargets = Object.keys(lucideNodes)
  .filter((n) => !customNames.has(n))
  .sort();

const clash = Object.keys(stirling).filter((n) => n in thirdParty);
if (clash.length) {
  console.error(`✖ same icon name in both svg dirs: ${clash.join(", ")}`);
  process.exit(1);
}
const shadowed = [...customNames].filter((n) => lucideNodes[n]);

const HEADER = (from) =>
  `// AUTO-GENERATED by editor/scripts/generate-icon-registry.mjs — do not edit.\n` +
  `// Source: ${from}\n` +
  `// Regenerate with: task frontend:prepare:icons\n\n`;

// Lucide's geometry ships inside our bundle, and ISC asks for its notice to
// travel with the copy. Marked @license so the minifier keeps it: esbuild drops
// every comment that is not `//!`, `/*!`, @license or @preserve, so a plain
// `//` line here would be stripped and the bundle would carry the art alone.
const LUCIDE_NOTICE =
  `/*! @license Lucide (ISC). Icon geometry below is Lucide's, used under the\n` +
  ` * ISC licence; the full notice is src/core/icons/LICENSE-lucide.txt, which\n` +
  ` * must stay in the repo for as long as this file does. */\n\n`;

const fmt = (v) => JSON.stringify(v);

// Same content, no write: a fresh mtime would make the dev server reload every
// consumer of the registry. Under --check a difference is the failure.
const stale = [];
function emit(file, content) {
  const target = path.join(ICONS_DIR, file);
  const current = fs.existsSync(target)
    ? fs.readFileSync(target, "utf8")
    : null;
  if (current === content) return;
  if (check) stale.push(file);
  else fs.writeFileSync(target, content);
}

function emitEntries(entries) {
  return Object.entries(entries)
    .map(
      ([name, e]) =>
        `  ${JSON.stringify(name)}: { viewBox: ${fmt(e.viewBox)}, mono: ${e.mono}, nodes: ${fmt(e.nodes)} },`,
    )
    .join("\n");
}

const licenseBlock = notices.size
  ? `/*! @license Icons in this file whose geometry is not entirely ours.\n` +
    [...notices]
      .map(
        ([name, text]) =>
          ` * \n * ${name}:\n${text
            .split("\n")
            .map((l) => ` * ${l.trim()}`)
            .join("\n")}`,
      )
      .join("\n") +
    `\n */\n\n`
  : "";

emit(
  "stirlingIcons.generated.ts",
  HEADER("src/core/icons/svg/stirling/*.svg") +
    licenseBlock +
    `import type { IconEntry } from "@app/icons/types";\n\n` +
    `export const STIRLING_ICONS = {\n${emitEntries(stirling)}\n} as const satisfies Record<string, IconEntry>;\n`,
);

emit(
  "thirdPartyIcons.generated.ts",
  HEADER("src/core/icons/svg/third-party/*.svg") +
    `import type { IconEntry } from "@app/icons/types";\n\n` +
    `export const THIRD_PARTY_ICONS = {\n${emitEntries(thirdParty)}\n} as const satisfies Record<string, IconEntry>;\n`,
);

const lucideEntries = {};
for (const name of lucideTargets) {
  lucideEntries[name] = {
    viewBox: "0 0 24 24",
    mono: true,
    nodes: lucideNodes[name].map(([tag, attrs]) => [tag, camelAttrs(attrs)]),
  };
}

emit(
  "registry.generated.ts",
  HEADER(`lucide-static ${lucideVersion()} + both svg dirs`) +
    LUCIDE_NOTICE +
    `import type { IconEntry } from "@app/icons/types";\n` +
    `import { STIRLING_ICONS } from "@app/icons/stirlingIcons.generated";\n` +
    `import { THIRD_PARTY_ICONS } from "@app/icons/thirdPartyIcons.generated";\n\n` +
    `export const STROKE_WIDTH = ${STROKE_WIDTH};\n` +
    `export const DEFAULT_SIZE = ${DEFAULT_SIZE};\n\n` +
    `const LUCIDE_ICONS = {\n${emitEntries(lucideEntries)}\n} as const satisfies Record<string, IconEntry>;\n\n` +
    `export const ICONS = {\n` +
    `  ...LUCIDE_ICONS,\n` +
    `  ...STIRLING_ICONS,\n` +
    `  ...THIRD_PARTY_ICONS,\n` +
    `} as const;\n\n` +
    `export type IconName = keyof typeof ICONS;\n`,
);

if (stale.length) {
  console.error(
    `\n✖ committed icon registry is stale (${stale.join(", ")}). Run: task frontend:prepare:icons\n`,
  );
  process.exit(1);
}

const bytes = fs.statSync(path.join(ICONS_DIR, "registry.generated.ts")).size;
log(
  `✅ icon registry: ${Object.keys(lucideEntries).length} lucide + ${Object.keys(stirling).length} stirling + ${Object.keys(thirdParty).length} third-party = ${Object.keys(lucideEntries).length + Object.keys(stirling).length + Object.keys(thirdParty).length} icons (${Math.round(bytes / 1024)}KB of TS)`,
);
if (shadowed.length)
  log(`ℹ️  custom svg shadows a lucide name: ${shadowed.join(", ")}`);
