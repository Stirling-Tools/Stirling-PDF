#!/usr/bin/env node

/**
 * Finds and optionally removes unused CSS custom properties from theme.css.
 *
 * Usage:
 *   node scripts/clean-unused-theme-vars.js           # dry run: report only
 *   node scripts/clean-unused-theme-vars.js --check   # CI mode: exit 1 if any unused
 *   node scripts/clean-unused-theme-vars.js --remove  # remove unused declarations
 *   node scripts/clean-unused-theme-vars.js --verbose # show all usage counts
 */

const fs = require("fs");
const path = require("path");

const REMOVE = process.argv.includes("--remove");
const CHECK = process.argv.includes("--check");
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

const EDITOR_ROOT = path.join(__dirname, "..");
const THEME_CSS_PATH = path.join(EDITOR_ROOT, "src/core/styles/theme.css");

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".js", ".jsx", ".mts", ".mjs"]);

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "target", "coverage", ".turbo"]);

// ─── Parse declarations ───────────────────────────────────────────────────────

function parseDeclarations(content) {
  const lines = content.split("\n");
  // Map from varName -> array of 0-based line indices where it is declared
  const declarations = new Map();

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(--[\w-]+)\s*:/);
    if (match) {
      const name = match[1];
      if (!declarations.has(name)) declarations.set(name, []);
      declarations.get(name).push(i);
    }
  }

  return declarations;
}

// ─── Scan for usages ─────────────────────────────────────────────────────────

const VAR_USAGE_RE = /var\((--[\w-]+)/g;

function collectUsagesInFile(filePath, used) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  VAR_USAGE_RE.lastIndex = 0;
  let match;
  while ((match = VAR_USAGE_RE.exec(content)) !== null) {
    used.add(match[1]);
  }
}

function scanDir(dir, used) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, used);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      collectUsagesInFile(fullPath, used);
    }
  }
}

// ─── Remove unused declarations ───────────────────────────────────────────────

function removeDeclarations(content, unusedNames) {
  const lines = content.split("\n");
  const filtered = [];
  let skipping = false;

  for (const line of lines) {
    if (skipping) {
      // Still consuming a multi-line value — stop when we hit the terminating semicolon
      if (line.includes(";")) skipping = false;
      continue;
    }

    const match = line.match(/^\s*(--[\w-]+)\s*:/);
    if (match && unusedNames.has(match[1])) {
      // If the value doesn't end on this line, skip subsequent lines too
      if (!line.includes(";")) skipping = true;
      continue;
    }

    filtered.push(line);
  }

  // Collapse runs of 3+ blank lines down to 2 (avoids gaps from removed blocks)
  const collapsed = [];
  let blankRun = 0;
  for (const line of filtered) {
    if (line.trim() === "") {
      blankRun++;
      if (blankRun <= 2) collapsed.push(line);
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }

  return collapsed.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(THEME_CSS_PATH)) {
    console.error("theme.css not found at:", THEME_CSS_PATH);
    process.exit(1);
  }

  const themeCss = fs.readFileSync(THEME_CSS_PATH, "utf8");
  const declarations = parseDeclarations(themeCss);

  console.log(`Found ${declarations.size} declared CSS variables in theme.css`);
  console.log("Scanning source files for usages...");

  const used = new Set();
  scanDir(EDITOR_ROOT, used);

  const unused = new Set();
  for (const name of declarations.keys()) {
    if (!used.has(name)) unused.add(name);
  }

  if (VERBOSE) {
    const allNames = [...declarations.keys()].sort();
    for (const name of allNames) {
      const status = used.has(name) ? "used  " : "UNUSED";
      console.log(`  ${status}  ${name}`);
    }
    console.log();
  }

  if (unused.size === 0) {
    console.log("No unused CSS variables found.");
    return;
  }

  const sortedUnused = [...unused].sort();
  console.log(`\nUnused variables (${unused.size}):`);
  for (const name of sortedUnused) {
    const lineNums = declarations.get(name).map((i) => i + 1).join(", ");
    console.log(`  ${name}  (line${declarations.get(name).length > 1 ? "s" : ""} ${lineNums})`);
  }

  if (CHECK) {
    console.error("\ntheme.css has unused CSS variables. Run the following to fix:");
    console.error("\n  task frontend:theme:clean-unused-vars REMOVE=true\n");
    process.exit(1);
  }

  if (!REMOVE) {
    console.log("\nDry run — no changes written. Re-run with --remove to delete unused declarations.");
    return;
  }

  const updated = removeDeclarations(themeCss, unused);
  fs.writeFileSync(THEME_CSS_PATH, updated, "utf8");

  // Count declarations removed
  const declsRemoved = [...unused].reduce(
    (sum, name) => sum + declarations.get(name).length,
    0,
  );
  console.log(
    `\nRemoved ${declsRemoved} declaration${declsRemoved !== 1 ? "s" : ""} (${unused.size} unique variable${unused.size !== 1 ? "s" : ""}) from theme.css`,
  );
}

main();
