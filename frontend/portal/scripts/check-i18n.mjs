/**
 * Portal i18n coverage guard.
 *
 * Fails if any static t("key") used in portal source has no matching entry in
 * the en-US source locale. Keeps the portal's translation coverage honest as
 * new strings are added — mirrors the editor's missingTranslations test.
 *
 * Dynamic keys (t(`ns.${x}`)) can't be resolved statically; we report their
 * literal prefixes for a human to eyeball but don't fail on them.
 *
 * Run from the frontend/ workspace: `node portal/scripts/check-i18n.mjs`
 * (wired into `task frontend:i18n:check:portal`).
 */
import { parse } from "smol-toml";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTAL = path.resolve(HERE, "..");
const LOCALE = path.join(PORTAL, "public/locales/en-US/translation.toml");
const SRC = path.join(PORTAL, "src");

const PLURAL = /_(zero|one|two|few|many|other)$/;

// Flatten the TOML to the set of leaf keys, plus array bases and plural bases.
const tree = parse(fs.readFileSync(LOCALE, "utf8"));
const keys = new Set();
const pluralBases = new Set();
(function walk(node, prefix) {
  if (Array.isArray(node)) {
    keys.add(prefix);
    node.forEach((v, i) => walk(v, prefix ? `${prefix}.${i}` : String(i)));
    return;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node))
      walk(node[k], prefix ? `${prefix}.${k}` : k);
    return;
  }
  keys.add(prefix);
  if (PLURAL.test(prefix)) pluralBases.add(prefix.replace(PLURAL, ""));
})(tree, "");

const resolves = (k) =>
  keys.has(k) ||
  pluralBases.has(k) ||
  [...keys].some((x) => x.startsWith(`${k}.`));

// Collect source files (excluding stories/tests).
const files = [];
(function walkDir(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p);
    else if (
      /\.(ts|tsx)$/.test(e.name) &&
      !/\.(stories|test|spec)\./.test(e.name)
    )
      files.push(p);
  }
})(SRC);

const STATIC = /\bt\(\s*"([^"]+)"/g;
const TEMPLATE = /\bt\(\s*`([^`]*)\$\{/g;
const missing = [];
const dynamicPrefixes = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const rel = path.relative(PORTAL, f);
  let m;
  while ((m = STATIC.exec(src)))
    if (!resolves(m[1])) missing.push(`${rel}: t("${m[1]}")`);
  while ((m = TEMPLATE.exec(src))) dynamicPrefixes.add(m[1]);
}

console.log(
  `portal i18n: ${keys.size} locale keys, ${files.length} source files`,
);
if (dynamicPrefixes.size)
  console.log(
    `dynamic key prefixes (verify manually): ${[...dynamicPrefixes].join(", ")}`,
  );

if (missing.length) {
  console.error(`\n❌ ${missing.length} t() key(s) missing from en-US:`);
  for (const x of missing) console.error(`  ${x}`);
  console.error(
    "\nAdd them to portal/public/locales/en-US/translation.toml (US English is the source of truth).",
  );
  process.exit(1);
}
console.log("✅ Every static t() key resolves in en-US.");
