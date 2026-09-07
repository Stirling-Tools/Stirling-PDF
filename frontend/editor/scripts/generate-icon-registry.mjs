#!/usr/bin/env node
/** Bundles the lucide icons the app references, plus every svg in both icon
 * dirs, into the *.generated.ts registry. */
import fs from "node:fs";
import path from "node:path";
// oxlint-disable-next-line no-restricted-imports -- build script; no alias covers scripts/
import {
  EXTRA_NAMES,
  STROKE_WIDTH,
  DEFAULT_SIZE,
} from "../src/core/icons/icons.config.mjs";

const EDITOR = path.join(import.meta.dirname, "..");
const SRC = path.join(EDITOR, "src");
const ICONS_DIR = path.join(SRC, "core/icons");
const LUCIDE = path.join(
  EDITOR,
  "../node_modules/lucide-static/icon-nodes.json",
);

const verbose = process.argv.includes("--verbose");
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

function parseAttrs(src) {
  const out = {};
  for (const m of src.matchAll(/([:a-zA-Z_][-:.\w]*)\s*=\s*"([^"]*)"/g)) {
    if (DROP_ATTRS.has(m[1])) continue;
    out[ATTR_CASE[m[1]] || m[1]] = m[2];
  }
  return out;
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

/** Every name the app could ask for: source literals, plus json data files. */
function scanReferencedNames(candidates) {
  const found = new Set();
  // Only icon-shaped positions: a bare literal scan would sweep in unrelated
  // words ("grape" is a Mantine colour, "cat" a language code).
  const PATTERNS = [
    /\bname\s*[:=]\s*"([a-z0-9-]+)"/g,
    /\bname\s*=\s*\{([^}]*)\}/g,
    /\b\w*icon\w*\s*[:=]\s*"([a-z0-9-]+)"/gi,
    /\b\w*icon\w*\s*=\s*\{([^}]*)\}/gi,
  ];
  const collect = (chunk) => {
    for (const m of chunk.matchAll(/"([a-z0-9][a-z0-9-]*)"/g))
      if (candidates.has(m[1])) found.add(m[1]);
    if (candidates.has(chunk)) found.add(chunk);
  };
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(p);
        continue;
      }
      if (!/\.(tsx?|json)$/.test(entry.name)) continue;
      // Never read our own output: the registry lists every name, so scanning
      // it would keep every icon bundled forever.
      if (p.startsWith(ICONS_DIR)) continue;
      const text = fs.readFileSync(p, "utf8");
      if (entry.name.endsWith(".json")) {
        for (const m of text.matchAll(/"icon(?:Name)?"\s*:\s*"([^"]+)"/g))
          if (candidates.has(m[1])) found.add(m[1]);
        continue;
      }
      // A file that names the IconName type is an icon table (lookup maps,
      // registries): every literal in it is a candidate. Everything else only
      // contributes literals sitting in an icon-shaped position.
      if (text.includes("IconName")) {
        collect(text);
        continue;
      }
      for (const re of PATTERNS)
        for (const m of text.matchAll(re)) collect(m[1]);
    }
  };
  walk(SRC);
  return found;
}

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
// 87.3x78, dropbox 16x16), and filling a square box makes it out-scale the
// stroke icons beside it. Map each mark onto the 24 grid's 20-unit ink box.
const GRID = 24;
const INK = 20;

function normaliseToGrid(viewBox, nodes, label) {
  const [minX, minY, w, h] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (![minX, minY, w, h].every(Number.isFinite) || w <= 0 || h <= 0)
    throw new Error(`${label}: cannot read viewBox "${viewBox}"`);
  const round = (n) => Number(n.toFixed(4));
  const scale = INK / Math.max(w, h);
  const tx = round((GRID - w * scale) / 2 - minX * scale);
  const ty = round((GRID - h * scale) / 2 - minY * scale);
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
      ? normaliseToGrid(read.viewBox, read.nodes, `${dir}/${file}`)
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

// A mapping target is satisfied either by lucide or by one of our own svgs, so
// custom icons have to be collected before the coverage check can run.
const customNames = new Set([
  ...Object.keys(stirling),
  ...Object.keys(thirdParty),
]);

// Bundle what the app actually asks for. A name it references but nothing
// provides simply is not in IconName, so the call site fails to compile.
const candidates = new Set([...Object.keys(lucideNodes), ...customNames]);
const referenced = scanReferencedNames(candidates);
for (const name of EXTRA_NAMES) referenced.add(name);

const missingExtras = EXTRA_NAMES.filter((n) => !candidates.has(n));
if (missingExtras.length) {
  console.error(
    `\n✖ EXTRA_NAMES lists ${missingExtras.length} name(s) neither lucide ${lucideVersion()} nor src/core/icons/svg/ provides:\n  ` +
      missingExtras.join("\n  ") +
      "\n",
  );
  process.exit(1);
}

const lucideTargets = new Set(
  [...referenced].filter((n) => !customNames.has(n)),
);

const clash = Object.keys(stirling).filter((n) => n in thirdParty);
if (clash.length) {
  console.error(`✖ same icon name in both svg dirs: ${clash.join(", ")}`);
  process.exit(1);
}
const shadowed = [...customNames].filter((n) => lucideNodes[n]);

// The lucide geometry ships in our bundle, and ISC asks for its notice to
// travel with it, so point at the copy that lives in the repo.
const HEADER = (from) =>
  `// AUTO-GENERATED by editor/scripts/generate-icon-registry.mjs — do not edit.\n` +
  `// Source: ${from}\n` +
  `// Regenerate with: task frontend:prepare:icons\n` +
  `// Lucide icons are ISC; the notice is in src/core/icons/LICENSE-lucide.txt\n\n`;

const fmt = (v) => JSON.stringify(v);

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

fs.writeFileSync(
  path.join(ICONS_DIR, "stirlingIcons.generated.ts"),
  HEADER("src/core/icons/svg/stirling/*.svg") +
    licenseBlock +
    `import type { IconEntry } from "@app/icons/types";\n\n` +
    `export const STIRLING_ICONS = {\n${emitEntries(stirling)}\n} as const satisfies Record<string, IconEntry>;\n`,
);

fs.writeFileSync(
  path.join(ICONS_DIR, "thirdPartyIcons.generated.ts"),
  HEADER("src/core/icons/svg/third-party/*.svg") +
    `import type { IconEntry } from "@app/icons/types";\n\n` +
    `export const THIRD_PARTY_ICONS = {\n${emitEntries(thirdParty)}\n} as const satisfies Record<string, IconEntry>;\n`,
);

const lucideEntries = {};
for (const name of [...lucideTargets].sort()) {
  lucideEntries[name] = {
    viewBox: "0 0 24 24",
    mono: true,
    nodes: lucideNodes[name].map(([tag, attrs]) => [
      tag,
      parseAttrs(
        Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" "),
      ),
    ]),
  };
}

fs.writeFileSync(
  path.join(ICONS_DIR, "registry.generated.ts"),
  HEADER(`lucide-static ${lucideVersion()} + both svg dirs`) +
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

const bytes = fs.statSync(path.join(ICONS_DIR, "registry.generated.ts")).size;
log(
  `✅ icon registry: ${Object.keys(lucideEntries).length} lucide + ${Object.keys(stirling).length} stirling + ${Object.keys(thirdParty).length} third-party = ${Object.keys(lucideEntries).length + Object.keys(stirling).length + Object.keys(thirdParty).length} icons (${Math.round(bytes / 1024)}KB of TS)`,
);
if (shadowed.length)
  log(`ℹ️  custom svg shadows a lucide name: ${shadowed.join(", ")}`);
