// Conservative unused-CSS detector (no deps).
// Reports CSS class selectors + custom properties that have ZERO references
// anywhere in the frontend source (className strings, `styles.x` module access,
// template-literal tokens, `var(--x)`, inline `"--x":` custom props, `composes:`).
// Conservative by design: if a token appears ANYWHERE outside its own selector
// definition, it's treated as USED (so dynamically-built classes are kept).
//
// Usage: cd frontend && node scripts/find-unused-css.mjs [filterSubstring]

import { readFileSync, readdirSync } from "node:fs";
import { join, extname, isAbsolute } from "node:path";

const ROOTS = ["editor/src", "shared", "portal/src"];
const SRC_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".html",
  ".mdx",
]);
const filter = process.argv[2] ?? "";

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (
      e.name === "node_modules" ||
      e.name === "dist" ||
      e.name.startsWith(".")
    )
      continue;
    // Dirents from readdirSync are always single path components, but guard
    // anyway so a name can never escape `dir` (satisfies Aikido's path-traversal
    // check on the readFile below).
    if (e.name.includes("..") || isAbsolute(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    // Exclude the temporary button-catalog gallery so its reproduced classes
    // don't mask genuinely-dead CSS.
    else if (!p.includes("_buttonGallery")) acc.push(p);
  }
  return acc;
}

const allFiles = ROOTS.flatMap((r) => walk(r));
const cssFiles = allFiles.filter((f) => extname(f) === ".css");
const srcFiles = allFiles.filter((f) => SRC_EXT.has(extname(f)));

const srcCorpus = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const cssCorpus = cssFiles.map((f) => readFileSync(f, "utf8")).join("\n");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- collect definitions ---------------------------------------------------
const classDef = new Map(); // class -> Set(file)
const varDef = new Map(); // --var -> Set(file)

for (const f of cssFiles) {
  const clean = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // class names only from SELECTOR preludes (text before each `{`), so we don't
  // pick up `.png`/`.svg` etc. inside property values.
  for (const rule of clean.matchAll(/([^{}]*)\{/g)) {
    for (const m of rule[1].matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) {
      if (!classDef.has(m[1])) classDef.set(m[1], new Set());
      classDef.get(m[1]).add(f);
    }
  }
  for (const m of clean.matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) {
    if (!varDef.has(m[1])) varDef.set(m[1], new Set());
    varDef.get(m[1]).add(f);
  }
}

// --- usage checks ----------------------------------------------------------
function classUsed(c) {
  // token in any source file (className="..", clsx, `tpl-${}`, styles.camel, etc.)
  if (new RegExp(`(^|[^\\w-])${esc(c)}([^\\w-]|$)`).test(srcCorpus))
    return true;
  // composed by another stylesheet
  if (new RegExp(`composes:[^;]*\\b${esc(c)}\\b`).test(cssCorpus)) return true;
  // dynamically constructed: a `-`/`_`-bounded prefix of `c` is immediately
  // followed by a template `${...}` in source, e.g. `sui-btn--${variant}`.
  for (let i = c.length - 1; i >= 3; i--) {
    if (c[i] === "-" || c[i] === "_") {
      if (new RegExp(`${esc(c.slice(0, i + 1))}\\$\\{`).test(srcCorpus))
        return true;
    }
  }
  return false;
}
function varUsed(v) {
  if (new RegExp(`var\\(\\s*${esc(v)}\\b`).test(cssCorpus + "\n" + srcCorpus))
    return true;
  if (new RegExp(`["']${esc(v)}["']\\s*:`).test(srcCorpus)) return true; // inline custom prop
  return false;
}

const rel = (f) =>
  f.replace("editor/src/", "").replace("portal/src/", "portal/");
// `mantine-*` are the framework's own runtime classes (applied by Mantine, not
// referenced in our source) — exclude; they can't be validated by source refs.
const unusedClasses = [...classDef.keys()]
  .filter((c) => !c.startsWith("mantine-") && !classUsed(c))
  .sort();
const unusedVars = [...varDef.keys()].filter((v) => !varUsed(v)).sort();

const show = (name) =>
  !filter || name.toLowerCase().includes(filter.toLowerCase());

console.log(
  `\n=== UNUSED CLASSES (${unusedClasses.filter(show).length}${filter ? ` matching "${filter}"` : ""} of ${unusedClasses.length} total) ===`,
);
for (const c of unusedClasses.filter(show)) {
  console.log(`.${c}\t${[...classDef.get(c)].map(rel).join(", ")}`);
}
console.log(
  `\n=== UNUSED VARS (${unusedVars.filter(show).length}${filter ? ` matching "${filter}"` : ""} of ${unusedVars.length} total) ===`,
);
for (const v of unusedVars.filter(show)) {
  console.log(`${v}\t${[...varDef.get(v)].map(rel).join(", ")}`);
}
