// In-memory patch for the pinned @embedpdf/engines: its PDFium font fallback
// picks a face by charset only, ignoring the requested font name and the
// serif/fixed-pitch flags PDFium passes, so a non-embedded Times or Courier
// renders in the sans fallback with mismatched glyph widths. The patch lets the
// fallback config name serif, monospace and wide-sans (Verdana-proportioned)
// faces, chosen from the face name and then from those flags.
//
// Applied while Vite reads the package (bundling, the dev prebundle, vitest),
// never written to node_modules, so read-only installs and builds that skip
// lifecycle scripts work unchanged.
//
// Upgrading @embedpdf/engines (any other version fails the build):
// 1. Remove embedpdfFontFallbackPlugin() from vite.config.ts and
//    vitest.config.ts, then run src/editor/core/services/pdfiumFontFallback.test.ts.
// 2. If it passes, the engine selects fallback faces by family itself: delete
//    this file and those two plugin entries. If it fails only because the
//    engine names the option differently, move `fontFamilies` in
//    pdfiumFontFallback.ts to that name and delete this file.
// 3. Otherwise restore the plugin entries, check each EDITS anchor still occurs
//    once in the new engine's dist files, then update EXPECTED_VERSION, bump
//    PATCH_REVISION and re-run the test.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin as EsbuildPlugin } from "esbuild";
import type { Plugin } from "vite";

const EXPECTED_VERSION = "2.15.1";
// Part of the plugin names, which feed Vite's dependency-prebundle hash: a
// change here rebuilds caches that hold the previous engine code.
const PATCH_REVISION = "2";
const ENGINES_DIST =
  /[\\/]node_modules[\\/]@embedpdf[\\/]engines[\\/]dist[\\/]/;
const MATCH_ANCHOR =
  "findBestFontMatch(charset, requestedWeight, requestedItalic) {";

// Families apply to every charset configured with the ANSI face, so the config
// alone decides which scripts get them. Compared by value: the worker receives
// a structured clone of the config. Names win over PDFium's pitch-family bits
// (FXFONT_FF_FIXEDPITCH = 1, FXFONT_FF_ROMAN = 16). The inserted code uses no
// single quotes or backslashes, so the same text is valid inside the worker
// engine's single-quoted source string.
const FAMILY_METHOD = `stirlingFamilyEntry(charset, pitchFamily, face) {
    const { fonts, fontFamilies: families } = this.fontConfig;
    if (!families || fonts[charset] === void 0 || JSON.stringify(fonts[charset]) !== JSON.stringify(fonts[0])) return void 0;
    const raw = (face || "").toLowerCase();
    const name = (raw.includes("+") ? raw.slice(raw.indexOf("+") + 1) : raw).replace(/[^a-z]/g, "");
    const has = (prefixes) => prefixes.some((prefix) => name.startsWith(prefix));
    let family = null;
    if (/mono(?!type)/.test(name) || has(["courier", "consolas", "menlo", "monaco", "lucidaconsole", "andale"])) family = "monospace";
    else if (has(["verdana", "dejavusans", "bitstreamvera"])) family = "wide";
    else if (has(["helvetica", "arial", "liberationsans", "nimbussans", "notosans", "calibri", "tahoma", "segoe", "trebuchet", "centurygothic"])) family = null;
    else if (has(["times", "georgia", "cambria", "garamond", "bookantiqua", "palatino", "liberationserif", "nimbusroman", "dejavuserif", "notoserif", "centuryschoolbook"])) family = "serif";
    else if (pitchFamily & 1) family = "monospace";
    else if (pitchFamily & 16) family = "serif";
    return family ? families[family] : void 0;
  }
  `;

const EDITS: { from: string | RegExp; to: string }[] = [
  {
    from: "const result = this.findBestFontMatch(charset, weight, italic);",
    to: "const result = this.findBestFontMatch(charset, weight, italic, this.stirlingFamilyEntry(charset, pitchFamily, face));",
  },
  {
    from: MATCH_ANCHOR,
    to: `${FAMILY_METHOD}findBestFontMatch(charset, requestedWeight, requestedItalic, familyEntry) {`,
  },
  {
    // Bundlers rename `fonts` per chunk (fonts, fonts2), so match the identifier.
    from: /const entry = (fonts\d*)\[charset\] \?\? defaultFont;/,
    to: "const entry = familyEntry ?? $1[charset] ?? defaultFont;",
  },
];

const escapeNewlines = (text: string) => text.replace(/\n/g, "\\n");
const fail = (file: string, reason: string): never => {
  throw new Error(
    `[embedpdf-font-fallback] ${path.basename(file)}: ${reason}. ` +
      "Follow the upgrade steps at the top of " +
      "frontend/scripts/embedpdfFontFallbackPatch.mts.",
  );
};

let checkedVersion = false;
function assertPinnedVersion(file: string) {
  if (checkedVersion) return;
  const pkgDir =
    file.slice(0, file.search(ENGINES_DIST)) +
    "/node_modules/@embedpdf/engines";
  const version = JSON.parse(
    readFileSync(path.join(pkgDir, "package.json"), "utf8"),
  ).version;
  if (version !== EXPECTED_VERSION) {
    fail(
      file,
      `expected @embedpdf/engines@${EXPECTED_VERSION}, found ${version}`,
    );
  }
  checkedVersion = true;
}

/**
 * Returns the patched source of an @embedpdf/engines file that carries the font
 * fallback manager, or null for any other file. Throws when a carrier file does
 * not match every anchor exactly once.
 */
export function patchEmbedpdfFontFallback(
  code: string,
  file: string,
): string | null {
  if (!ENGINES_DIST.test(file)) return null;
  // Before the anchor search: an engine that renamed the method would
  // otherwise skip the patch silently.
  assertPinnedVersion(file);
  const anchorAt = code.indexOf(MATCH_ANCHOR);
  if (anchorAt === -1) return null;
  // The worker engine embeds its source as a string literal with `\n` escapes.
  const escaped = code.startsWith("\\n", anchorAt + MATCH_ANCHOR.length);
  let out = code;
  for (const edit of EDITS) {
    const to = escaped ? escapeNewlines(edit.to) : edit.to;
    if (edit.from instanceof RegExp) {
      const count = out.match(new RegExp(edit.from, "g"))?.length ?? 0;
      if (count !== 1)
        fail(file, `expected one match for ${edit.from}, found ${count}`);
      out = out.replace(edit.from, to);
    } else {
      const from = escaped ? escapeNewlines(edit.from) : edit.from;
      const count = out.split(from).length - 1;
      if (count !== 1)
        fail(
          file,
          `expected one match for "${edit.from.slice(0, 50)}", found ${count}`,
        );
      out = out.replace(from, () => to);
    }
  }
  return out;
}

/** Applies the patch to bundled code, to Vite's dev prebundle and to vitest. */
export function embedpdfFontFallbackPlugin(): Plugin {
  const prebundle: EsbuildPlugin = {
    name: `embedpdf-font-fallback-${PATCH_REVISION}`,
    setup(build) {
      build.onLoad(
        { filter: /[\\/]@embedpdf[\\/]engines[\\/]dist[\\/].*\.c?js$/ },
        (args) => {
          const patched = patchEmbedpdfFontFallback(
            readFileSync(args.path, "utf8"),
            args.path,
          );
          return patched === null
            ? undefined
            : { contents: patched, loader: "js" };
        },
      );
    },
  };
  return {
    name: `embedpdf-font-fallback-${PATCH_REVISION}`,
    enforce: "pre",
    config: () => ({
      optimizeDeps: { esbuildOptions: { plugins: [prebundle] } },
    }),
    transform(code, id) {
      const patched = patchEmbedpdfFontFallback(code, id.split("?")[0]);
      return patched === null ? null : { code: patched, map: null };
    },
  };
}
