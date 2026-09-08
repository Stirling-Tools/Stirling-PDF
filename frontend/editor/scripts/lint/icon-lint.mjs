#!/usr/bin/env node
/** Keeps the app on one icon system. Each rule explains itself when it fires;
 * pass "unused" to report registry entries nothing references. */
import fs from "node:fs";
import path from "node:path";

const EDITOR = path.join(import.meta.dirname, "..", "..");
const SRC = path.join(EDITOR, "src");
const ICONS_DIR = path.join(SRC, "core/icons");

const BANNED_IMPORTS = [
  "@mui/icons-material",
  "@iconify/react",
  "@iconify-json/",
  "lucide-react",
  "components/shared/LocalIcon",
  "components/icons",
];

/** Directories where a .svg file is allowed to live. */
const SVG_ALLOWED = [
  path.join(ICONS_DIR, "svg"),
  path.join(SRC, "core/assets"),
  path.join(SRC, "assets"),
  path.join(SRC, "core/tests"),
];

const OPT_OUT = /icon-lint-disable/;

const mode = process.argv[2];
const problems = [];
const files = [];

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(p);
    } else {
      files.push(p);
    }
  }
})(SRC);

const rel = (f) => path.relative(EDITOR, f);

// An svg that reuses another set's geometry points at the vendored notice.
// Deleting that notice while the svg remains would leave the geometry here with
// no licence, so the pointer is only trustworthy if this is enforced.
const licenceFile = path.join(ICONS_DIR, "LICENSE-lucide.txt");
const citing = fs
  .readdirSync(path.join(ICONS_DIR, "svg/stirling"))
  .filter((f) => f.endsWith(".svg"))
  .filter((f) =>
    fs
      .readFileSync(path.join(ICONS_DIR, "svg/stirling", f), "utf8")
      .includes("LICENSE-lucide.txt"),
  );
if (citing.length && !fs.existsSync(licenceFile)) {
  problems.push(
    `src/core/icons/LICENSE-lucide.txt is missing, but ${citing.join(", ")} ` +
      `reuse lucide geometry and cite it. Restore it, or redraw those icons.`,
  );
}

// An svg that reuses lucide geometry has to say so, or the notice obligation
// travels with a file that never mentions it. Straight-line and primitive
// shapes are excluded: nobody can claim `M4 12h16`.
const lucidePath = new Map();
try {
  const nodes = JSON.parse(
    fs.readFileSync(
      path.join(EDITOR, "../node_modules/lucide-static/icon-nodes.json"),
      "utf8",
    ),
  );
  for (const [name, els] of Object.entries(nodes))
    for (const [, a] of els)
      if (a.d) lucidePath.set(a.d.replace(/\s+/g, " ").trim(), name);
} catch {
  // lucide not installed: the icons still carry their notices, nothing to check
}
if (lucidePath.size) {
  for (const svg of fs
    .readdirSync(path.join(ICONS_DIR, "svg/stirling"))
    .filter((f) => f.endsWith(".svg"))) {
    const raw = fs.readFileSync(
      path.join(ICONS_DIR, "svg/stirling", svg),
      "utf8",
    );
    const copied = [...raw.matchAll(/\sd="([^"]+)"/g)]
      .map((m) => m[1].replace(/\s+/g, " ").trim())
      .filter((d) => lucidePath.has(d))
      .filter(
        (d) =>
          /[aAcCsSqQtT]/.test(d) || d.split(/[ ,]/).filter(Boolean).length > 6,
      );
    if (copied.length && !raw.includes("LICENSE-lucide.txt")) {
      problems.push(
        `src/core/icons/svg/stirling/${svg}: undeclared lucide geometry ` +
          `(from ${[...new Set(copied.map((d) => lucidePath.get(d)))].join(", ")}). ` +
          `Add a comment citing src/core/icons/LICENSE-lucide.txt, or redraw it.`,
      );
    }
  }
}

// Every Material Symbols name, so a leftover from the old icon set is caught
// wherever it sits (a `return "add-comment"` in a helper typed `string`, not
// only `<Icon name>`). Read from the package while the migration audit keeps it
// installed; icon-map.json is the fallback once it goes.
function legacyIconNames() {
  try {
    const set = JSON.parse(
      fs.readFileSync(
        path.join(
          EDITOR,
          "../node_modules/@iconify-json/material-symbols/icons.json",
        ),
        "utf8",
      ),
    );
    return new Set(Object.keys(set.icons));
  } catch {
    try {
      const map = JSON.parse(
        fs.readFileSync(path.join(ICONS_DIR, "icon-map.json"), "utf8"),
      );
      return new Set(Object.keys(map.materialSymbols ?? {}));
    } catch {
      return new Set();
    }
  }
}
const legacy = legacyIconNames();

// Positions where a hyphenated literal is an identifier, not an icon name.
const NOT_AN_ICON_POSITION =
  /(?:\b(?:id|key|type|kind|variant|mode|status|action|value|label|className|class|href|path|to|for|role)|data-[\w-]*|aria-[\w-]*|testid)\s*[:=]\s*$/i;

const registry = fs.readFileSync(
  path.join(ICONS_DIR, "registry.generated.ts"),
  "utf8",
);
const stirling = fs.readFileSync(
  path.join(ICONS_DIR, "stirlingIcons.generated.ts"),
  "utf8",
);
const thirdParty = fs.readFileSync(
  path.join(ICONS_DIR, "thirdPartyIcons.generated.ts"),
  "utf8",
);
const known = new Set(
  [registry, stirling, thirdParty].flatMap((src) =>
    [...src.matchAll(/^ {2}"([^"]+)": \{ viewBox:/gm)].map((m) => m[1]),
  ),
);

const referenced = new Set();

for (const file of files) {
  const isCode = /\.tsx?$/.test(file);

  if (file.endsWith(".svg")) {
    if (!SVG_ALLOWED.some((dir) => file.startsWith(dir))) {
      problems.push(
        `${rel(file)}: .svg outside src/core/icons/svg/. Icons belong there so the ` +
          `generator can bundle them; other artwork belongs under assets/.`,
      );
    }
    continue;
  }

  // A stylesheet fill beats <Icon>`s fill="none" presentation attribute, which
  // turns every stroke icon in that scope into a solid blob.
  if (file.endsWith(".css") && !file.startsWith(ICONS_DIR)) {
    const css = fs.readFileSync(file, "utf8");
    for (const m of css.matchAll(/([^{}]*svg[^{}]*)\{([^}]*)\}/g)) {
      const decl = /(^|[;\s])fill\s*:\s*(?!none|transparent)/.test(m[2]);
      if (decl && !OPT_OUT.test(m[0])) {
        const line = css.slice(0, m.index).split("\n").length;
        problems.push(
          `${rel(file)}:${line}: sets fill on an svg. Icons are strokes with ` +
            `fill="none"; a css fill overrides that and renders them solid. ` +
            `Colour them with \`color\` instead.`,
        );
      }
    }
    continue;
  }

  if (!isCode) continue;
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const inIconsDir = file.startsWith(ICONS_DIR);

  lines.forEach((line, i) => {
    // No inline svg outside core/icons
    if (/<svg[\s>]/.test(line) && !inIconsDir) {
      const context = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
      if (!OPT_OUT.test(context)) {
        problems.push(
          `${rel(file)}:${i + 1}: inline <svg>. Move it to src/core/icons/svg/ and render ` +
            `via <Icon>, or add "// icon-lint-disable -- <reason>" if the geometry is ` +
            `computed at runtime.`,
        );
      }
    }

    // A Material name the registry does not also know is a leftover from the
    // old icon set. These reach <Icon> through props typed
    // `IconName | ReactNode` (ReactNode admits any string), plain `string`
    // fields, or a `map[key] ?? fallback` whose fallback the compiler never
    // checks, so the type system cannot see them.
    for (const m of line.matchAll(/"([a-z0-9]+(?:-[a-z0-9]+)+)"/g)) {
      const name = m[1];
      const isLegacy =
        /-(?:rounded|outlined|sharp|twotone)$/.test(name) || legacy.has(name);
      if (!isLegacy || known.has(name)) continue;
      if (NOT_AN_ICON_POSITION.test(line.slice(0, m.index))) continue;
      if (OPT_OUT.test(line)) continue;
      problems.push(
        `${rel(file)}:${i + 1}: "${name}" is a Material Symbols name, not a registry ` +
          `icon; <Icon> would draw the placeholder. Use the lucide equivalent, or ` +
          `add "// icon-lint-disable -- <reason>" if it is not an icon name.`,
      );
    }

    // No retired icon library
    if (/^\s*(import|export)\b/.test(line) || /\brequire\(/.test(line)) {
      for (const banned of BANNED_IMPORTS) {
        if (
          line.includes(banned) &&
          !inIconsDir &&
          !OPT_OUT.test(lines[i - 1] ?? "")
        ) {
          problems.push(
            `${rel(file)}:${i + 1}: imports ${banned}. Use <Icon name="…" /> from @app/ui/Icon.`,
          );
        }
      }
    }
  });

  // Every name literal must resolve. Skipped in core/icons, whose stories build
  // names from the registry rather than writing them out.
  if (inIconsDir) continue;
  for (const m of text.matchAll(/<Icon\b[^>]*?\bname="([^"]+)"/gs)) {
    // `name="${x}"` inside a template literal is a placeholder, not a name.
    if (m[1].includes("${")) continue;
    referenced.add(m[1]);
    if (!known.has(m[1])) {
      problems.push(
        `${rel(file)}: <Icon name="${m[1]}" /> is not in the registry. Add an svg to ` +
          `src/core/icons/svg/, or fix the name.`,
      );
    }
  }
  // Names also reach <Icon> via ternaries, wrapper props and data tables, so
  // count any matching literal: over-counting beats deleting a live icon.
  for (const m of text.matchAll(/"([a-z0-9][a-z0-9-]*)"/g)) {
    if (known.has(m[1])) referenced.add(m[1]);
  }
}

if (mode === "unused") {
  // BrandMark resolves these from a connector type the API returns, so they
  // never appear as literals.
  const brandMarks = fs
    .readdirSync(path.join(ICONS_DIR, "svg/third-party"))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/, ""));
  for (const mark of brandMarks) referenced.add(mark);

  const unused = [...known].filter((n) => !referenced.has(n)).sort();
  console.log(
    unused.length
      ? `${unused.length} registry entries nothing references:\n  ${unused.join("\n  ")}`
      : "✅ every registry entry is referenced",
  );
  process.exit(0);
}

if (problems.length) {
  console.error(`\n✖ icon-lint: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}

console.log(`✅ icon-lint: ${known.size} icons, one system, no inline svg`);
