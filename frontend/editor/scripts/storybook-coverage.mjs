#!/usr/bin/env node
// Storybook coverage report — which rendered surfaces have a story, and what
// stands between the ones that don't and having one. Modes:
//
//   node storybook-coverage.mjs           summary by area (report only)
//   node storybook-coverage.mjs --todo    every uncovered surface, with the
//                                         work each needs
//   node storybook-coverage.mjs --area core/components/tools
//
// Coverage is counted by *import*, not by an adjacent .stories.tsx: several
// components are covered by a shared story file (MantineForms covers Select,
// MultiSelect, NumberInput and ColorInput between them), and counting siblings
// reports those as gaps and invites duplicate stories.
//
// Each uncovered surface is classified by what a story would have to supply:
//
//   props      nothing — it renders from its props
//   context    it (or something it renders) reads a React context. The cheap
//              fix is usually to export the context and hand the story the
//              slice the component actually touches, rather than mounting the
//              provider and whatever chain sits behind it.
//   data       it fetches, so the story needs MSW handlers
//   router     it reads router state
//
// Not counted as surfaces at all: providers, contexts, gates, routers, test
// helpers, and modules that return a config object rather than markup.
//
// Known blocker: desktop/ cannot be storied as things stand. Storybook resolves
// @app/* through the proprietary vite tsconfig (proprietary -> core), but the
// desktop flavour resolves it desktop-first, and 34 desktop files import
// @app/* assets that only exist under desktop/ — e.g.
// @app/components/shared/DisabledButtonWithTooltip.css. Those imports fail to
// resolve in Storybook, so the story file will not load at all. Fixing it means
// either a desktop-aware alias in .storybook/main.ts or moving the shared
// assets; until then desktop/ is reported as a gap it is not yet possible to
// close.
//
// Run from frontend/.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(process.cwd(), "editor/src");
const args = process.argv.slice(2);
const wantTodo = args.includes("--todo");
const areaFilter = args.includes("--area")
  ? args[args.indexOf("--area") + 1]
  : null;

/* ── file walk ────────────────────────────────────────────────────────────── */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const all = walk(SRC);
const rel = (f) => relative(SRC, f).split("\\").join("/");
const storyFiles = all.filter((f) => f.endsWith(".stories.tsx"));
const sources = all.filter(
  (f) => !f.endsWith(".stories.tsx") && !f.endsWith(".test.tsx"),
);

/* ── what the stories already reach ───────────────────────────────────────── */

const importedNames = new Set();
const importedPaths = new Set();
for (const f of storyFiles) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(
    /import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))\s*(?:,\s*\{([^}]*)\})?\s*from\s+["']([^"']+)/g,
  )) {
    for (const group of [m[1], m[3]]) {
      if (!group) continue;
      for (const name of group.split(","))
        importedNames.add(
          name.trim().split(" as ")[0].replace("type ", "").trim(),
        );
    }
    if (m[2]) importedNames.add(m[2]);
    importedPaths.add(m[4]);
  }
}

/* ── classification ───────────────────────────────────────────────────────── */

const INFRA_NAME =
  /(Provider|Providers|Context|Gate|Boundary|Mount|Router|Guard)\.tsx$/;
const INFRA_DIR = /\/(contexts|test|tests|mocks|hooks|types|utils|api|data)\//;
const RENDERS = /return\s*\(?\s*<|=>\s*\(?\s*</;
// A module whose exported function returns a config object, not markup.
const CONFIG_FACTORY = /:\s*(SlideConfig|ToolFlowConfig|\w+Config)\s*\{/;
const DATA = /\buse(Query|Mutation|SWR|InfiniteQuery)\b|\bfetch\w*\(/;
const ROUTER = /\buse(Navigate|Params|Location|SearchParams)\b/;
const CONTEXT = /\buse[A-Z]\w*\(/g;
// Hooks that are plainly not context reads.
const LOCAL_HOOK =
  /^use(State|Effect|Memo|Callback|Ref|Id|Reducer|Context|Translation|LayoutEffect|ImperativeHandle|Transition|DeferredValue|SyncExternalStore|Debounced\w*|Media\w*|Disclosure|Form)$/;
// Contexts .storybook/preview.tsx already mounts for every story. A component
// that reads only these needs no fixture work, so it counts as props-level.
const HARNESS_PROVIDED =
  /^use(Preferences|SidebarContext|Tier|Link|UI|Theme|QueryClient|Navigate|Location|Params|SearchParams)$/;

const byPath = new Map(sources.map((f) => [rel(f), f]));

function localImports(src, fromRel) {
  const out = [];
  for (const m of src.matchAll(
    /from\s+["'](@app\/|@core\/|\.\.?\/)([^"']+)/g,
  )) {
    const spec = m[1] + m[2];
    const guess = spec.replace(/^@app\//, "core/").replace(/^@core\//, "core/");
    for (const cand of [`${guess}.tsx`, `${guess}/index.tsx`]) {
      if (byPath.has(cand)) out.push(cand);
    }
    void fromRel;
  }
  return out;
}

/** Does this file, or anything it renders, read a context? Depth-limited. */
function needsContext(relPath, seen = new Set(), depth = 0) {
  if (depth > 3 || seen.has(relPath)) return false;
  seen.add(relPath);
  const file = byPath.get(relPath);
  if (!file) return false;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(CONTEXT)) {
    const name = m[0].slice(0, -1);
    if (!LOCAL_HOOK.test(name) && !HARNESS_PROVIDED.test(name)) return true;
  }
  return localImports(src, relPath).some((child) =>
    needsContext(child, seen, depth + 1),
  );
}

const rows = [];
for (const file of sources) {
  const r = rel(file);
  const base = r.split("/").pop();
  if (!/^[A-Z]/.test(base)) continue;
  const src = readFileSync(file, "utf8");
  if (!RENDERS.test(src)) continue;
  if (INFRA_NAME.test(base) || INFRA_DIR.test("/" + r)) continue;
  if (CONFIG_FACTORY.test(src)) continue;

  const stem = base.replace(".tsx", "");
  const tail = r.replace(".tsx", "");
  const covered =
    importedNames.has(stem) ||
    [...importedPaths].some((p) => p.endsWith(tail) || p.endsWith("/" + stem));

  let needs = "props";
  if (DATA.test(src)) needs = "data";
  else if (ROUTER.test(src)) needs = "router";
  else if (needsContext(r)) needs = "context";

  const parts = r.split("/");
  rows.push({
    area: parts.slice(0, Math.min(3, parts.length - 1)).join("/"),
    file: r,
    covered,
    needs,
    loc: src.split("\n").length,
  });
}

/* ── report ───────────────────────────────────────────────────────────────── */

const shown = areaFilter
  ? rows.filter((r) => r.file.startsWith(areaFilter))
  : rows;
const todo = shown.filter((r) => !r.covered);

if (wantTodo || areaFilter) {
  const order = { props: 0, context: 1, router: 2, data: 3 };
  for (const r of todo.sort(
    (a, b) => order[a.needs] - order[b.needs] || a.loc - b.loc,
  )) {
    console.log(
      `  ${r.needs.padEnd(8)} ${String(r.loc).padStart(5)} loc  ${r.file}`,
    );
  }
  console.log("");
}

const areas = new Map();
for (const r of shown) {
  const a = areas.get(r.area) ?? { total: 0, covered: 0 };
  a.total += 1;
  if (r.covered) a.covered += 1;
  areas.set(r.area, a);
}

console.log(
  `${"area".padEnd(38)}${"total".padStart(6)}${"covered".padStart(9)}${"%".padStart(6)}`,
);
for (const [area, a] of [...areas].sort(
  (x, y) => y[1].total - y[1].covered - (x[1].total - x[1].covered),
)) {
  if (a.total === a.covered) continue;
  const pct = Math.round((100 * a.covered) / a.total);
  console.log(
    `${area.padEnd(38)}${String(a.total).padStart(6)}${String(a.covered).padStart(9)}${String(pct).padStart(5)}%`,
  );
}

const covered = shown.filter((r) => r.covered).length;
const byNeed = todo.reduce(
  (acc, r) => ((acc[r.needs] = (acc[r.needs] ?? 0) + 1), acc),
  {},
);
console.log(
  `\nsurfaces ${shown.length}   covered ${covered} (${Math.round((100 * covered) / shown.length)}%)   remaining ${todo.length}`,
);
console.log(
  `remaining by what a story needs: ` +
    Object.entries(byNeed)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join("   "),
);
