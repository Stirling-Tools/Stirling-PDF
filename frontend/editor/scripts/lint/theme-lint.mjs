#!/usr/bin/env node
// Theme colour lint — guards the theme SYSTEM (core/theme/). Two modes:
//
//   node theme-lint.mjs            enforce: literal colours live ONLY in
//                                  primitives.css; colors/dimensions must
//                                  reference tokens; no duplicate primitives.
//                                  (blocking)
//   node theme-lint.mjs contrast   warn-only WCAG contrast report (never blocks)
//
// Scope is deliberately just core/theme/ — the palette + token layer this PR
// owns, which is clean, so no baseline file is needed. Enforcing "no hardcoded
// colours" across the whole app (260+ existing sites) is a separate migration.
//
// Structural black / white / transparent (shadows, scrims) are always allowed.

import { readFileSync, readdirSync } from "node:fs";
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
  const primitives = {};
  for (const m of primitivesCss.matchAll(
    /(--p-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  ))
    primitives[m[1]] = m[2];
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
  const hexToRgb = (h) => {
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
  };
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
  // else the theme map/seed), or color-mix(in srgb, A n%, B|transparent).
  function resolveValue(v, t, seen) {
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
      return resolveVar(m[1], m[2], t, seen);
    }
    if ((m = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%\s*,\s*(.+)\)$/))) {
      const a = resolveValue(m[1], t, seen);
      if (!a) return null;
      if (m[3].trim() === "transparent") return { ...a, a: +m[2] / 100 };
      const b = resolveValue(m[3].trim(), t, seen);
      return b ? mix(a, b, +m[2]) : null;
    }
    return null;
  }
  function resolveVar(name, fallback, t, seen) {
    if (name.startsWith("--p-")) {
      return primitives[name]
        ? hexToRgb(primitives[name])
        : fallback
          ? resolveValue(fallback, t, seen)
          : null;
    }
    if (!seen.has(name) && t[name] !== undefined) {
      const next = new Set(seen).add(name);
      const r = resolveValue(t[name], t, next);
      if (r) return r;
    }
    return fallback ? resolveValue(fallback, t, seen) : null;
  }
  const resolve = (token, t) =>
    resolveValue(t[token] ?? null, t, new Set([token]));
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (t1, t2, t) => {
    const surface = resolve("--c-surface", t);
    let a = resolve(t1, t);
    let b = resolve(t2, t);
    if (!a || !b || !surface) return null;
    if (a.a < 1) a = over(a, surface);
    if (b.a < 1) b = over(b, surface);
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
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

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv.includes("contrast")) {
  reportContrast();
  process.exit(0); // never blocks
}

const violations = check();
if (violations.length) {
  console.error(
    `\n✖ theme-lint: ${violations.length} raw/duplicate colour(s) in core/theme/:\n`,
  );
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.msg}`);
  console.error(
    `\nDefine every colour once in core/theme/primitives.css and reference it with var(--p-…).\n`,
  );
  process.exit(1);
}
console.log(
  "✓ theme-lint: core/theme colours all route through the primitive palette",
);
