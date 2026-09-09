/** Which registry icons source references. A heuristic, and only ever a report: the whole registry ships regardless. */
import fs from "node:fs";
import path from "node:path";

// Icon-shaped positions only: a bare literal scan sweeps in "grape" (a Mantine colour) and "cat" (a language code).
const PATTERNS = [
  /\bname\s*[:=]\s*"([a-z0-9-]+)"/g,
  /\bname\s*=\s*\{([^}]*)\}/g,
  /\b\w*icon\w*\s*[:=]\s*"([a-z0-9-]+)"/gi,
  /\b\w*icon\w*\s*=\s*\{([^}]*)\}/gi,
];

/** Icon names declared in one *.generated.ts registry file. */
export function registryNames(file) {
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(/^ {2}"([^"]+)": \{ viewBox:/gm)].map((m) => m[1]);
}

/** The members of `known` that anything under `srcDir` references. */
export function scanUsedIcons(srcDir, known) {
  const found = new Set();
  // core/icons writes every name down, so reading it back reports the whole set as used.
  const iconsDir = path.join(srcDir, "core/icons");
  const collect = (chunk) => {
    for (const m of chunk.matchAll(/"([a-z0-9][a-z0-9-]*)"/g))
      if (known.has(m[1])) found.add(m[1]);
    if (known.has(chunk)) found.add(chunk);
  };
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(p);
        continue;
      }
      if (!/\.(tsx?|json)$/.test(entry.name)) continue;
      if (p.startsWith(iconsDir)) continue;
      const text = fs.readFileSync(p, "utf8");
      if (entry.name.endsWith(".json")) {
        for (const m of text.matchAll(/"icon(?:Name)?"\s*:\s*"([^"]+)"/g))
          if (known.has(m[1])) found.add(m[1]);
        continue;
      }
      // A file naming IconName is a lookup table, so every literal in it counts.
      if (text.includes("IconName")) {
        collect(text);
        continue;
      }
      for (const re of PATTERNS)
        for (const m of text.matchAll(re)) collect(m[1]);
    }
  };
  walk(srcDir);
  return found;
}
