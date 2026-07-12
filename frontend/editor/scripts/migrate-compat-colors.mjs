// Codemod: rewrite consumers of the legacy compat colour aliases to the
// canonical `--c-*` tokens they map to. Only the 1:1 `--legacy: var(--c-x);`
// aliases in compat.css are migrated (aliases that carry a color-mix/fallback
// stay — they're computed, not renames). Only `var(--legacy…)` REFERENCES are
// touched, never definitions, so it's safe to run repo-wide.
//
//   node editor/scripts/migrate-compat-colors.mjs [--dry]
//
// Run from the `frontend/` directory.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";

const DRY = process.argv.includes("--dry");
const ROOT = resolve(process.cwd(), "editor/src");
const COMPAT = resolve(process.cwd(), "editor/src/core/theme/compat.css");

// Dirs/files to skip: the theme system itself (defines the tokens) and build/vendor.
const SKIP_DIRS = new Set(["node_modules", "dist", "theme"]);
const SKIP_FILE = /\.(test|stories)\.(t|j)sx?$/;
const EXTS = new Set([".css", ".ts", ".tsx"]);

// Parse compat.css for pure 1:1 `--legacy: var(--c-x);` mappings.
function parseMap() {
  const css = readFileSync(COMPAT, "utf8");
  const map = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*var\(\s*(--c-[a-z0-9-]+)\s*\)\s*;/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    // Never remap a --c-* onto itself or map the canonical tokens.
    if (m[1].startsWith("--c-")) continue;
    map.set(m[1].slice(2), m[2].slice(2)); // store without leading "--"
  }
  return map;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name)) && !SKIP_FILE.test(name)) out.push(p);
  }
  return out;
}

const map = parseMap();
// One regex per alias: match `var(  --legacy` (a reference), not `--legacy:`.
const patterns = [...map.entries()].map(([legacy, canonical]) => ({
  legacy,
  canonical,
  re: new RegExp(`var\\(\\s*--${legacy}(?![\\w-])`, "g"),
}));

let filesChanged = 0;
let totalReplacements = 0;
const perAlias = new Map();

for (const file of walk(ROOT)) {
  let text = readFileSync(file, "utf8");
  let changed = 0;
  for (const { legacy, canonical, re } of patterns) {
    text = text.replace(re, (match) => {
      changed++;
      perAlias.set(legacy, (perAlias.get(legacy) ?? 0) + 1);
      return match.replace(`--${legacy}`, `--${canonical}`);
    });
  }
  if (changed > 0) {
    filesChanged++;
    totalReplacements += changed;
    if (!DRY) writeFileSync(file, text);
  }
}

console.log(`compat aliases (1:1): ${map.size}`);
console.log(
  `${DRY ? "[dry] would change" : "changed"} ${filesChanged} files, ${totalReplacements} references`,
);
const top = [...perAlias.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [alias, n] of top) console.log(`  --${alias} → --${map.get(alias)}: ${n}`);
