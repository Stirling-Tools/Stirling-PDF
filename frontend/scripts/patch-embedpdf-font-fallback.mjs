#!/usr/bin/env node
// Local patch for the pinned @embedpdf/engines: its PDFium font fallback picks a
// face by charset only, ignoring the requested font name and the serif/fixed-pitch
// flags PDFium passes, so a non-embedded Times or Courier renders in the sans
// fallback with mismatched glyph widths. The patch adds an optional
// `fontFamilies` config (serif/monospace) chosen from the face name, then from
// those flags. Delete once upstream ships family selection
// (embedpdf/embed-pdf-viewer#850).
//
// Runs from postinstall and from the Vite build. `--check` verifies without
// writing and exits non-zero when any target is unpatched.
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_VERSION = "2.15.1";
const MARKER = "STIRLING_FONT_FAMILY_PATCH";
const checkOnly = process.argv.includes("--check");
const log = (msg) => console.error(`[patch-embedpdf-font-fallback] ${msg}`);

const enginesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../node_modules/@embedpdf/engines",
);
const packageJsonPath = path.join(enginesDir, "package.json");
if (!existsSync(packageJsonPath)) {
  log("@embedpdf/engines is not installed");
  process.exit(1);
}
const installedVersion = JSON.parse(
  readFileSync(packageJsonPath, "utf8"),
).version;
if (installedVersion !== EXPECTED_VERSION) {
  log(
    `expected @embedpdf/engines@${EXPECTED_VERSION}, found ${installedVersion}. ` +
      "Check whether the new version selects fallback fonts by family; if not, " +
      "re-verify every anchor below before updating EXPECTED_VERSION.",
  );
  process.exit(1);
}

const distDir = path.join(enginesDir, "dist");
const directEngine = readdirSync(distDir).find((name) =>
  /^direct-engine-.*\.js$/.test(name),
);
// The browser loads the ESM direct engine and the worker engine, whose worker
// source is one single-quoted string literal with `\n` escapes. The minified
// CommonJS direct engine has no browser consumer and is left alone.
const targets = [
  {
    file: path.join(distDir, directEngine ?? "direct-engine-*.js"),
    escaped: false,
  },
  {
    file: path.join(distDir, "lib/pdfium/web/worker-engine.js"),
    escaped: true,
  },
  {
    file: path.join(distDir, "lib/pdfium/web/worker-engine.cjs"),
    escaped: true,
  },
];
const typesFile = path.join(distDir, "lib/pdfium/font-fallback.d.ts");

// PDFium's pitch-family bits (FXFONT_FF_FIXEDPITCH, FXFONT_FF_ROMAN). The
// inserted code avoids quotes other than double quotes and backslashes, so the
// same text is valid inside the worker's single-quoted string.
const FAMILY_METHOD = `stirlingFamilyEntry(charset, pitchFamily, face) {
    // ${MARKER}
    const families = this.fontConfig.fontFamilies;
    if (!families || ![0, 1, 161, 204, 238].includes(charset)) return void 0;
    const raw = (face || "").toLowerCase();
    const name = (raw.includes("+") ? raw.slice(raw.indexOf("+") + 1) : raw).replace(/[^a-z]/g, "");
    const has = (prefixes) => prefixes.some((prefix) => name.startsWith(prefix));
    let family = null;
    if (has(["courier", "consolas", "menlo", "monaco", "lucidaconsole", "liberationmono", "nimbusmono", "dejavusansmono", "notomono", "andalemono"])) family = "monospace";
    else if (has(["helvetica", "arial", "liberationsans", "nimbussans", "notosans", "dejavusans", "calibri", "verdana", "tahoma", "segoe", "trebuchet"])) family = null;
    else if (has(["times", "georgia", "cambria", "garamond", "bookantiqua", "palatino", "liberationserif", "nimbusroman", "dejavuserif", "notoserif", "century"])) family = "serif";
    else if (pitchFamily & 1) family = "monospace";
    else if (pitchFamily & 16) family = "serif";
    return family ? families[family] : void 0;
  }
  `;

const edits = [
  {
    from: "const result = this.findBestFontMatch(charset, weight, italic);",
    to: "const result = this.findBestFontMatch(charset, weight, italic, this.stirlingFamilyEntry(charset, pitchFamily, face));",
  },
  {
    from: "findBestFontMatch(charset, requestedWeight, requestedItalic) {",
    to: `${FAMILY_METHOD}findBestFontMatch(charset, requestedWeight, requestedItalic, familyEntry) {`,
  },
  {
    // Bundlers rename `fonts` per chunk (fonts, fonts2), so match the identifier.
    from: /const entry = (fonts\d*)\[charset\] \?\? defaultFont;/,
    to: "const entry = familyEntry ?? $1[charset] ?? defaultFont;",
  },
];

const escape = (text) => text.replace(/\n/g, "\\n");

function patchSource(source, escaped) {
  let out = source;
  for (const edit of edits) {
    const to = escaped ? escape(edit.to) : edit.to;
    if (edit.from instanceof RegExp) {
      const matches = out.match(new RegExp(edit.from, "g")) ?? [];
      if (matches.length !== 1)
        return {
          error: `expected one match for ${edit.from}, found ${matches.length}`,
        };
      out = out.replace(edit.from, to);
    } else {
      const from = escaped ? escape(edit.from) : edit.from;
      const count = out.split(from).length - 1;
      if (count !== 1)
        return {
          error: `expected one match for "${edit.from.slice(0, 50)}…", found ${count}`,
        };
      out = out.replace(from, () => to);
    }
  }
  return { out };
}

const TYPES_FROM = "    fonts: Partial<Record<FontCharset, FontEntry>>;";
const TYPES_TO = `${TYPES_FROM}
    /**
     * ${MARKER}: fallbacks for Latin charsets chosen by the requested face name,
     * then by PDFium's serif and fixed-pitch flags. Faces matching neither use
     * \`fonts\`.
     */
    fontFamilies?: Partial<Record<"serif" | "monospace", FontEntry>>;`;

let failed = false;
let changed = false;

for (const { file, escaped } of targets) {
  const rel = path.relative(enginesDir, file);
  if (!existsSync(file)) {
    log(`missing ${rel}`);
    failed = true;
    continue;
  }
  const source = readFileSync(file, "utf8");
  if (source.includes(MARKER)) continue;
  if (checkOnly) {
    log(`${rel} is not patched`);
    failed = true;
    continue;
  }
  const { out, error } = patchSource(source, escaped);
  if (error) {
    log(`${rel}: ${error}`);
    failed = true;
    continue;
  }
  writeFileSync(file, out);
  changed = true;
}

const types = readFileSync(typesFile, "utf8");
if (!types.includes(MARKER)) {
  if (checkOnly) {
    log("font-fallback.d.ts is not patched");
    failed = true;
  } else if (types.split(TYPES_FROM).length - 1 !== 1) {
    log("font-fallback.d.ts: FontFallbackConfig.fonts anchor not found");
    failed = true;
  } else {
    writeFileSync(
      typesFile,
      types.replace(TYPES_FROM, () => TYPES_TO),
    );
    changed = true;
  }
}

if (failed) process.exit(1);
if (changed) {
  // Vite's dependency prebundle (one cache dir per mode, `.vite-<mode>`) holds
  // the unpatched engine and would keep serving it.
  const nodeModulesDir = path.dirname(path.dirname(enginesDir));
  for (const entry of readdirSync(nodeModulesDir)) {
    if (entry.startsWith(".vite")) {
      rmSync(path.join(nodeModulesDir, entry), {
        recursive: true,
        force: true,
      });
    }
  }
  log(`patched @embedpdf/engines@${EXPECTED_VERSION}`);
}
