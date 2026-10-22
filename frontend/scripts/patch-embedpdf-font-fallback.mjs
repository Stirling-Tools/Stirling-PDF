#!/usr/bin/env node
// Local patch for the pinned @embedpdf/engines: its PDFium font fallback picks a
// face by charset only, ignoring the requested font name and the serif/fixed-pitch
// flags PDFium passes, so a non-embedded Times or Courier renders in the sans
// fallback with mismatched glyph widths. The patch adds an optional
// `fontFamilies` config (serif/monospace) chosen from the face name, then from
// those flags.
// TODO(embedpdf/embed-pdf-viewer#850): delete once upstream selects fallback
// faces by family.
//
// Runs from postinstall and from the Vite config hook, which fails the dev
// server or build when the engine cannot be patched.
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
const MARKER_BASE = "STIRLING_FONT_FAMILY_PATCH";
// Bump with any change to the inserted code: an already patched tree cannot be
// re-patched in place, and npm install does not refresh a satisfied dependency.
const MARKER = `${MARKER_BASE}_v2`;
const log = (msg) => console.error(`[patch-embedpdf-font-fallback] ${msg}`);
// A version bump must not break `npm install` itself (Dependabot, lockfile
// refreshes); the Vite hook and pdfiumFontFallback.test.ts still fail on it.
const inPostinstall = process.env.npm_lifecycle_event === "postinstall";

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
  process.exit(inPostinstall ? 0 : 1);
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

// Families apply to every charset configured with the ANSI face, so the config
// alone decides which scripts get them. Compared by value: the worker receives
// a structured clone of the config. Names win over PDFium's pitch-family bits
// (FXFONT_FF_FIXEDPITCH = 1, FXFONT_FF_ROMAN = 16). The inserted code uses no
// single quotes or backslashes, so the same text is valid inside the worker's
// single-quoted string.
const FAMILY_METHOD = `stirlingFamilyEntry(charset, pitchFamily, face) {
    // ${MARKER}
    const { fonts, fontFamilies: families } = this.fontConfig;
    if (!families || fonts[charset] === void 0 || JSON.stringify(fonts[charset]) !== JSON.stringify(fonts[0])) return void 0;
    const raw = (face || "").toLowerCase();
    const name = (raw.includes("+") ? raw.slice(raw.indexOf("+") + 1) : raw).replace(/[^a-z]/g, "");
    const has = (prefixes) => prefixes.some((prefix) => name.startsWith(prefix));
    let family = null;
    if (/mono(?!type)/.test(name) || has(["courier", "consolas", "menlo", "monaco", "lucidaconsole", "andale"])) family = "monospace";
    else if (has(["helvetica", "arial", "liberationsans", "nimbussans", "notosans", "dejavusans", "calibri", "verdana", "tahoma", "segoe", "trebuchet", "centurygothic"])) family = null;
    else if (has(["times", "georgia", "cambria", "garamond", "bookantiqua", "palatino", "liberationserif", "nimbusroman", "dejavuserif", "notoserif", "centuryschoolbook"])) family = "serif";
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
     * ${MARKER}: fallbacks chosen by the requested face name, then by PDFium's
     * serif and fixed-pitch flags, for every charset configured with the ANSI
     * entry. Faces matching neither use \`fonts\`.
     */
    fontFamilies?: Partial<Record<"serif" | "monospace", FontEntry>>;`;

let failed = false;
let changed = false;

/** Writes the patched text, or reports why it cannot. */
function apply(rel, source, patch) {
  if (source.includes(MARKER)) return;
  if (source.includes(MARKER_BASE)) {
    log(
      `${rel} was patched by an older revision of this script; delete ` +
        "node_modules/@embedpdf/engines and run `npm install` again.",
    );
    failed = true;
    return;
  }
  const { out, error } = patch(source);
  if (error) {
    log(`${rel}: ${error}`);
    failed = true;
    return;
  }
  return out;
}

for (const { file, escaped } of targets) {
  const rel = path.relative(enginesDir, file);
  if (!existsSync(file)) {
    log(`missing ${rel}`);
    failed = true;
    continue;
  }
  const out = apply(rel, readFileSync(file, "utf8"), (source) =>
    patchSource(source, escaped),
  );
  if (out !== undefined) {
    writeFileSync(file, out);
    changed = true;
  }
}

const typesOut = apply(
  "font-fallback.d.ts",
  readFileSync(typesFile, "utf8"),
  (source) =>
    source.split(TYPES_FROM).length - 1 === 1
      ? { out: source.replace(TYPES_FROM, () => TYPES_TO) }
      : { error: "FontFallbackConfig.fonts anchor not found" },
);
if (typesOut !== undefined) {
  writeFileSync(typesFile, typesOut);
  changed = true;
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
