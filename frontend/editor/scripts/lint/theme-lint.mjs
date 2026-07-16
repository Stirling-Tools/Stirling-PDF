#!/usr/bin/env node
// Theme colour lint — guards the theme system + app-wide colour hygiene. Modes:
//
//   node theme-lint.mjs            enforce: literal colours live ONLY in
//                                  primitives.css; core/theme references tokens;
//                                  no duplicate primitives. (blocking)
//   node theme-lint.mjs css-colors enforce: NO hardcoded colour in any source
//                                  .css (primitives.css + generated output.css
//                                  exempt). Scope: all editor/src. (blocking)
//   node theme-lint.mjs code-colors enforce: no hardcoded colour in TS/TSX DOM
//                                  code (default-deny with layered exemptions;
//                                  `// theme-allow-color` opt-out). (blocking)
//   node theme-lint.mjs contrast   warn-only WCAG report — fixed --c-* pairs +
//                                  status-tone text/fill pairs. (The tone gate
//                                  below 1.6:1 is enforced in the default run.)
//
// Structural black / white / transparent (shadows, scrims) are always allowed.

import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { relative, resolve, join } from "node:path";

const THEME = resolve(process.cwd(), "editor/src/core/theme");
const PRIMITIVES = "editor/src/core/theme/primitives.css";

// Fixed list of theme CSS files to check, so every read takes a constant path
// (no directory-listing feeding into a file read). readdir is used only to fail
// if a new .css is added without being registered — coverage can't silently
// lapse — but its output is never passed to readFileSync.
const THEME_FILES = [
  "primitives.css",
  "colors.css",
  "compat.css",
  "dimensions.css",
  "index.css",
];

// ── colour helpers ─────────────────────────────────────────────────────────
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FUNC_RE = /\b(?:rgba?|hsla?)\(\s*[^)]*\)/g;
const NAMED_RE =
  /\b(?:white|black|red|green|blue|orange|yellow|purple|gray|grey|silver|transparent)\b/g;

function expandHex(hex) {
  let h = hex.slice(1).toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (h.length === 4) h = [...h].map((c) => c + c).join("");
  return "#" + h;
}
function normalizeColor(raw) {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("#")) return expandHex(s);
  const nums = s.match(/[\d.]+%?/g);
  if (!nums) return s;
  return `${s.startsWith("hsl") ? "hsl" : "rgb"}(${nums.join(",")})`;
}
function isStructuralColor(norm) {
  return (
    norm === "transparent" ||
    /^#000000(00)?$/.test(norm) ||
    /^#ffffff(ff)?$/.test(norm) ||
    /^rgb\(0,0,0[,)]/.test(norm) ||
    /^rgb\(255,255,255[,)]/.test(norm)
  );
}
function isStructuralName(name) {
  return /^(?:white|black|transparent)$/i.test(name.trim());
}
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

// ── shared colour math + token resolution (used by contrast report + tone guard)
function readPrimitives(css) {
  const primitives = {};
  for (const m of css.matchAll(
    /(--p-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  ))
    primitives[m[1]] = m[2];
  return primitives;
}
function hexToRgb(h) {
  h = h.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: 1,
  };
}
const over = (f, b) => ({
  r: f.r * f.a + b.r * (1 - f.a),
  g: f.g * f.a + b.g * (1 - f.a),
  b: f.b * f.a + b.b * (1 - f.a),
  a: 1,
});
const mix = (a, b, p) => ({
  r: (a.r * p + b.r * (100 - p)) / 100,
  g: (a.g * p + b.g * (100 - p)) / 100,
  b: (a.b * p + b.b * (100 - p)) / 100,
  a: 1,
});
// Resolve any token value: hex, rgb(a), var(--x[, fallback]) (--p-* → palette,
// else the theme map), or color-mix(in srgb, A n%, B|transparent).
function resolveColorValue(v, t, primitives, seen) {
  if (v == null) return null;
  v = v.trim();
  let m;
  if (v.startsWith("#")) return hexToRgb(v);
  if ((m = v.match(/^rgba?\(([^)]+)\)$/))) {
    const n = m[1]
      .split(/[,/\s]+/)
      .map(Number)
      .filter((x) => !Number.isNaN(x));
    return { r: n[0], g: n[1], b: n[2], a: n[3] ?? 1 };
  }
  if ((m = v.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/))) {
    return resolveColorVar(m[1], m[2], t, primitives, seen);
  }
  if ((m = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%\s*,\s*(.+)\)$/))) {
    const a = resolveColorValue(m[1], t, primitives, seen);
    if (!a) return null;
    if (m[3].trim() === "transparent") return { ...a, a: +m[2] / 100 };
    const b = resolveColorValue(m[3].trim(), t, primitives, seen);
    return b ? mix(a, b, +m[2]) : null;
  }
  return null;
}
function resolveColorVar(name, fallback, t, primitives, seen) {
  if (name.startsWith("--p-")) {
    return primitives[name]
      ? hexToRgb(primitives[name])
      : fallback
        ? resolveColorValue(fallback, t, primitives, seen)
        : null;
  }
  if (!seen.has(name) && t[name] !== undefined) {
    const next = new Set(seen).add(name);
    const r = resolveColorValue(t[name], t, primitives, next);
    if (r) return r;
  }
  return fallback ? resolveColorValue(fallback, t, primitives, seen) : null;
}
const relativeLuminance = ({ r, g, b }) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrastRatio = (a, b) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
};

// ── enforce: literals only in primitives.css, no duplicate primitives ────────
function check() {
  const violations = [];
  const primitiveValues = new Map();
  const lineOf = (text, index) => text.slice(0, index).split("\n").length;

  // Fail if a theme .css exists that isn't registered above (readdir is only
  // compared here — never used to build a path passed to readFileSync).
  const known = new Set(THEME_FILES);
  for (const name of readdirSync(THEME)) {
    if (name.endsWith(".css") && !known.has(name)) {
      violations.push({
        file: relative(process.cwd(), join(THEME, name)),
        line: 1,
        msg: `unregistered theme CSS — add "${name}" to THEME_FILES in theme-lint.mjs`,
      });
    }
  }

  for (const name of THEME_FILES) {
    const rel = relative(process.cwd(), join(THEME, name));
    const isPrimitives = rel === PRIMITIVES;
    const text = stripComments(readFileSync(join(THEME, name), "utf8"));

    for (const re of [HEX_RE, FUNC_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const norm = normalizeColor(m[0]);
        if (isStructuralColor(norm)) continue;
        if (isPrimitives) {
          if (primitiveValues.has(norm)) {
            violations.push({
              file: rel,
              line: lineOf(text, m.index),
              msg: `duplicate primitive value ${norm} (also ${primitiveValues.get(norm)})`,
            });
          } else {
            primitiveValues.set(norm, m[0]);
          }
        } else {
          violations.push({
            file: rel,
            line: lineOf(text, m.index),
            msg: `raw colour ${m[0]} — define it in primitives.css and use var()`,
          });
        }
      }
    }

    // Named colours, only in value position.
    if (!isPrimitives) {
      text.split("\n").forEach((line, i) => {
        const colon = line.indexOf(":");
        if (colon < 0 || /[{}]/.test(line)) return;
        // Property must be a lone identifier — a custom prop (--x) OR a standard
        // property (color, border) — so `color: red` is checked, not just tokens,
        // while selectors (`.foo:hover`) with a colon are skipped.
        if (!/^\s*(?:--)?[a-z][a-z0-9-]*\s*$/i.test(line.slice(0, colon)))
          return;
        const value = line
          .slice(colon + 1)
          .replace(/--[a-z0-9-]+/gi, " ")
          .replace(/url\([^)]*\)/g, " ")
          .replace(/["'][^"']*["']/g, " ");
        for (const nm of value.match(NAMED_RE) || []) {
          if (isStructuralName(nm)) continue;
          violations.push({
            file: rel,
            line: i + 1,
            msg: `named colour "${nm}" — define it in primitives.css and use var()`,
          });
        }
      });
    }
  }
  return violations;
}

// ── contrast report (warn-only): resolve --c-* per theme, check legibility ───
function reportContrast() {
  const primitivesCss = readFileSync(join(THEME, "primitives.css"), "utf8");
  const colorsCss = readFileSync(join(THEME, "colors.css"), "utf8");
  const primitives = readPrimitives(primitivesCss);
  const blocks = [];
  for (const m of colorsCss.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decls = {};
    for (const d of m[2].matchAll(/(--c-[a-z0-9-]+)\s*:\s*([^;]+);/g))
      decls[d[1]] = d[2].trim();
    if (Object.keys(decls).length)
      blocks.push({ selector: m[1].trim(), decls });
  }
  // The editor always renders data-app-theme="custom"; the accent (--user-*) is
  // injected at runtime, so seed the DEFAULT blue to resolve the custom tint
  // statically. Themes = the ones that actually render: editor custom light/dark
  // (data-app-theme="custom") and the portal's neutral dark (data-theme="dark").
  const SEED = {
    "--user-primary": "#3b82f6",
    "--user-primary-on": "#ffffff",
    "--user-accent-fg": "#3b82f6",
  };
  const pick = (re) => blocks.filter((b) => re.test(b.selector));
  const lightBase = pick(/:root/);
  const customBase = blocks.filter(
    (b) =>
      /app-theme="custom"/.test(b.selector) &&
      !/color-scheme="dark"/.test(b.selector),
  );
  const customDark = pick(
    /app-theme="custom"\]\[data-mantine-color-scheme="dark"/,
  );
  const midnight = pick(/data-theme="dark"/);
  const themes = {
    "editor light": [...lightBase, ...customBase],
    "editor dark": [...lightBase, ...customBase, ...customDark],
    "portal dark": [...lightBase, ...midnight],
  };
  const flatten = (list) =>
    Object.assign({ ...SEED }, ...list.map((b) => b.decls));
  const resolve = (token, t) =>
    resolveColorValue(t[token] ?? null, t, primitives, new Set([token]));
  const contrast = (t1, t2, t) => {
    const surface = resolve("--c-surface", t);
    let a = resolve(t1, t);
    let b = resolve(t2, t);
    if (!a || !b || !surface) return null;
    if (a.a < 1) a = over(a, surface);
    if (b.a < 1) b = over(b, surface);
    return contrastRatio(a, b);
  };
  const PAIRS = [
    ["--c-text", "--c-surface", 4.5],
    ["--c-text-muted", "--c-surface", 4.5],
    ["--c-text-subtle", "--c-surface", 4.5],
    ["--c-text", "--c-bg", 4.5],
    ["--c-text-on-primary", "--c-primary", 3.0],
  ];
  let warnings = 0;
  console.log("contrast report (warning-only, default accent):\n");
  for (const name of Object.keys(themes)) {
    const t = flatten(themes[name]);
    console.log(`  ${name}`);
    for (const [t1, t2, floor] of PAIRS) {
      const r = contrast(t1, t2, t);
      if (r == null) {
        console.log(`    ?     ${t1} on ${t2} (unresolved)`);
        continue;
      }
      if (r < floor) warnings++;
      console.log(
        `    ${r < floor ? "⚠ " : "  "}${r.toFixed(2).padStart(5)}  (floor ${floor})  ${t1} on ${t2}`,
      );
    }
    console.log("");
  }
  console.log(
    warnings
      ? `⚠ ${warnings} pair(s) below floor — review, not blocking.`
      : "✓ all pairs clear their floor.",
  );
}

// ── status-tone text on its own fill ─────────────────────────────────────────
// Checks --color-{hue} text against its --color-{hue}-light fill, per theme.
// Below TONE_INVISIBLE blocks the build; TONE_FLOOR (WCAG AA) is advisory.
const TOKENS_CSS = resolve(process.cwd(), "editor/src/core/tokens/tokens.css");
const TONE_FLOOR = 3.0;
const TONE_INVISIBLE = 1.6;
// Compute the contrast of every --color-{hue} text on its own --color-{hue}-light
// fill, per theme. Returns [{ theme, base, fill, ratio|null }] — no printing, so
// both the warn-only report and the blocking guard can share it.
function toneContrastResults() {
  const primitives = readPrimitives(
    readFileSync(join(THEME, "primitives.css"), "utf8"),
  );
  // Strip comments first: a selector's captured prefix can otherwise include a
  // preceding comment that mentions data-theme="dark", misclassifying the block.
  const css = stripComments(readFileSync(TOKENS_CSS, "utf8"));
  const isDark = (sel) => /data-theme="dark"|color-scheme="dark"/.test(sel);
  const lightTones = {};
  const darkTones = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const target = isDark(m[1]) ? darkTones : lightTones;
    for (const d of m[2].matchAll(/(--color-[a-z0-9-]+)\s*:\s*([^;]+);/g))
      target[d[1]] = d[2].trim();
  }
  // Dark only overrides the tones it redefines; unspecified ones inherit light.
  const themes = { light: lightTones, dark: { ...lightTones, ...darkTones } };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const results = [];
  for (const [theme, t] of Object.entries(themes)) {
    const bases = Object.keys(t)
      .map((k) => /^(--color-[a-z]+)-light$/.exec(k)?.[1])
      .filter((base) => base && t[base] !== undefined);
    for (const base of bases) {
      const fill = `${base}-light`;
      const fg = resolveColorValue(t[base], t, primitives, new Set([base]));
      const bg = resolveColorValue(t[fill], t, primitives, new Set([fill]));
      const ratio =
        fg && bg
          ? contrastRatio(
              fg.a < 1 ? over(fg, bg) : fg,
              bg.a < 1 ? over(bg, white) : bg,
            )
          : null;
      results.push({ theme, base, fill, ratio });
    }
  }
  return results;
}

function reportToneContrast() {
  const results = toneContrastResults();
  let warnings = 0;
  let invisible = 0;
  console.log("tone-contrast report: text on its own -light fill\n");
  let theme = "";
  for (const { theme: th, base, fill, ratio } of results) {
    if (th !== theme) {
      theme = th;
      console.log(`  ${theme}`);
    }
    if (ratio == null) {
      console.log(`    ?      ${base} on ${fill} (unresolved)`);
      continue;
    }
    // ✖ = near-invisible (blocks CI), ⚠ = below the WCAG floor (warn only).
    const mark =
      ratio < TONE_INVISIBLE ? "✖ " : ratio < TONE_FLOOR ? "⚠ " : "  ";
    if (ratio < TONE_INVISIBLE) invisible++;
    else if (ratio < TONE_FLOOR) warnings++;
    console.log(
      `    ${mark}${ratio.toFixed(2).padStart(5)}  (floor ${TONE_FLOOR}, blocks <${TONE_INVISIBLE})  ${base} on ${fill}`,
    );
  }
  const parts = [];
  if (invisible)
    parts.push(`✖ ${invisible} near-invisible (<${TONE_INVISIBLE}:1)`);
  if (warnings) parts.push(`⚠ ${warnings} below the ${TONE_FLOOR} floor`);
  console.log(
    parts.length
      ? `\n${parts.join(", ")}. ✖ blocks the build; ⚠ is advisory.\n`
      : "\n✓ all tones clear the floor.\n",
  );
}

// ── css-colors (blocking): no hardcoded colour in ANY source .css ────────────
// App-wide guard that source CSS routes every colour through the palette. File
// list from `git ls-files` (a VCS query, never a directory walk feeding a read).
// primitives.css (the literal home) and generated output.css are exempt.
function checkAppCss() {
  const EXEMPT = /(?:^|\/)(?:primitives\.css|output\.css)$/;
  const listed = execSync("git ls-files -- editor/src", { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l.endsWith(".css") && !EXEMPT.test(l));

  const violations = [];
  const lineOf = (text, index) => text.slice(0, index).split("\n").length;
  for (const rel of listed) {
    const text = stripComments(readFileSync(rel, "utf8"));
    for (const re of [HEX_RE, FUNC_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (/var\(/i.test(m[0])) continue; // rgb()/color-mix wrapping a token
        const norm = normalizeColor(m[0]);
        if (isStructuralColor(norm)) continue;
        violations.push({
          file: rel,
          line: lineOf(text, m.index),
          msg: `raw colour ${m[0]} — define it in primitives.css and use var(--p-…)`,
        });
      }
    }
    text.split("\n").forEach((line, i) => {
      const colon = line.indexOf(":");
      if (colon < 0 || /[{}]/.test(line)) return;
      if (!/^\s*(?:--)?[a-z][a-z0-9-]*\s*$/i.test(line.slice(0, colon))) return;
      const value = line
        .slice(colon + 1)
        .replace(/--[a-z0-9-]+/gi, " ")
        .replace(/url\([^)]*\)/g, " ")
        .replace(/["'][^"']*["']/g, " ");
      for (const nm of value.match(NAMED_RE) || []) {
        if (isStructuralName(nm)) continue;
        violations.push({
          file: rel,
          line: i + 1,
          msg: `named colour "${nm}" — define it in primitives.css and use var(--p-…)`,
        });
      }
    });
  }
  return violations;
}

// ── code-colors (blocking): no hardcoded colour in TS/TSX DOM code ───────────
// Default-deny with layered exemptions: structural black/white/transparent;
// safe contexts on the line (var() fallback, canvas/pdf-lib rgb, an explicit
// `// theme-allow-color` opt-out); and exempt PATHS where colour literals are
// inherent (rendering/vendor/config/tests/stories).
const CODE_EXEMPT_PATH = [
  /Thumbnail|Overlay|DrawingCanvas|PageEditor|MobileScannerPage/,
  /[Pp]df|PDF|pixelCompare|\/compare\.ts$|customPrimary|accentColors/,
  /validateSignature\/outputtedPDFSections|CenteredMessageSection|StatusBadgeSection/,
  /\/viewer\/|Annotation|useViewerReadAloud|CommentsSidebar|\/constants\/search\.ts$|SignaturePreview/,
  /ColorPicker|ColorControl|WatchedFolderManagementModal|watchedFolderPresets|fileColors|unifiedBackground|folder\.ts$|policyFolders/,
  /OAuthButtons|oauthCallbackHtml/,
  /mantineTheme|\/theme\.ts$|toolsTaxonomy|LayoutPreview|PageNumberPreview|CloudStorageIcons/,
  /\/onboarding\//,
  /addStamp|addWatermark|\/tooltips\//,
  /UpgradeBanner|AdminPlanSection/,
  /\.test\.[jt]sx?$|\.stories\.[jt]sx?$|\/types\//,
];
const CODE_HEX =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const CODE_RGB = /rgba?\(([^)]*)\)/gi;
const codeStructuralHex = (h) =>
  /^#(?:000|fff|000f|ffff|000000|ffffff|00000000|ffffffff)$/i.test(h);
const CODE_SKIP_LINE =
  /theme-allow-color|var\(\s*--[a-z0-9-]+\s*,|readColor\(|getPropertyValue|\.colors\.[a-z]+\?\.\[|fillStyle|strokeStyle|shadowColor|addColorStop|createLinearGradient|ctx\.|getContext/i;
function codeStripNonCode(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (m, p) => p + m.slice(p.length).replace(/[^\n]/g, " "),
    )
    .replace(/&#\d+;/g, "     ");
}
function codeRgbIsColour(inner) {
  if (/var\(/.test(inner)) return false;
  const p = inner
    .split(/[, /]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!/^\d/.test(p[0] || "")) return false;
  const nums = p.slice(0, 3).map(Number);
  if (nums.some((n) => Number.isNaN(n))) return false;
  if (nums.every((n) => n <= 1)) return false; // pdf-lib rgb(0..1)
  const k = `${nums[0]},${nums[1]},${nums[2]}`;
  return k !== "0,0,0" && k !== "255,255,255";
}
function checkCodeColors() {
  const files = execSync("git ls-files -- editor/src", { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) => /\.(ts|tsx)$/.test(l) && !CODE_EXEMPT_PATH.some((re) => re.test(l)),
    );
  const violations = [];
  for (const rel of files) {
    const raw = readFileSync(rel, "utf8");
    const rawLines = raw.split("\n");
    const text = codeStripNonCode(raw);
    text.split("\n").forEach((line, i) => {
      if (/theme-allow-color/.test(rawLines[i] || "")) return;
      if (CODE_SKIP_LINE.test(line)) return;
      const hits = [];
      for (const h of line.match(CODE_HEX) || [])
        if (!codeStructuralHex(h)) hits.push(h);
      for (const m of line.match(CODE_RGB) || [])
        if (codeRgbIsColour(m.replace(/rgba?\(|\)/gi, ""))) hits.push(m);
      for (const h of hits)
        violations.push({
          file: rel,
          line: i + 1,
          msg: `hardcoded colour ${h} — use a var(--c-*/--p-*) token, or add \`// theme-allow-color <reason>\` if it must be a literal`,
        });
    });
  }
  return violations;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv.includes("contrast")) {
  reportContrast();
  reportToneContrast();
  process.exit(0); // never blocks
}

if (process.argv.includes("css-colors")) {
  const v = checkAppCss();
  if (v.length) {
    console.error(`\n✖ theme-lint css-colors: ${v.length} hardcoded colour(s) in source CSS:\n`);
    for (const x of v) console.error(`  ${x.file}:${x.line}  ${x.msg}`);
    console.error(`\nDefine every colour once in core/theme/primitives.css and reference it with var(--p-…).\n`);
    process.exit(1);
  }
  console.log("✓ theme-lint css-colors: source CSS is free of hardcoded colour");
  process.exit(0);
}

if (process.argv.includes("code-colors")) {
  const v = checkCodeColors();
  if (v.length) {
    console.error(`\n✖ theme-lint code-colors: ${v.length} hardcoded colour(s) in TS/TSX:\n`);
    for (const x of v) console.error(`  ${x.file}:${x.line}  ${x.msg}`);
    console.error("");
    process.exit(1);
  }
  console.log("✓ theme-lint code-colors: no hardcoded colour in TS/TSX DOM code (rendering/vendor/config areas exempt)");
  process.exit(0);
}

const violations = check();
// Block near-invisible status tones (< TONE_INVISIBLE) in either theme.
const toneViolations = toneContrastResults().filter(
  (r) => r.ratio != null && r.ratio < TONE_INVISIBLE,
);
if (violations.length || toneViolations.length) {
  if (violations.length) {
    console.error(
      `\n✖ theme-lint: ${violations.length} raw/duplicate colour(s) in core/theme/:\n`,
    );
    for (const v of violations)
      console.error(`  ${v.file}:${v.line}  ${v.msg}`);
    console.error(
      `\nDefine every colour once in core/theme/primitives.css and reference it with var(--p-…).\n`,
    );
  }
  if (toneViolations.length) {
    console.error(
      `\n✖ theme-lint: ${toneViolations.length} status tone(s) below the ${TONE_INVISIBLE}:1 legibility floor (text nearly invisible on its own fill):\n`,
    );
    for (const v of toneViolations)
      console.error(
        `  ${v.base} on ${v.fill} — ${v.ratio.toFixed(2)}:1 in ${v.theme} theme`,
      );
    console.error(
      `\nGive --color-{hue}-light a paler/darker tint in core/tokens/tokens.css so the label is legible.\n`,
    );
  }
  process.exit(1);
}
console.log(
  "✓ theme-lint: core/theme colours route through the primitive palette; status tones clear the legibility floor",
);
