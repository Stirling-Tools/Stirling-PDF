/** Which registry icons the app actually renders, found by scanning source for
 * names sitting in icon-shaped positions.
 *
 * Deliberately a heuristic. Nothing builds on its answer: the whole registry
 * ships either way, so this feeds the `Icons/Registry` gallery and the unused
 * report and nothing else. An over-count leaves a stale row in a gallery, an
 * under-count a wrong line in a report. The generator used to bundle from this
 * scan, which is what made being wrong expensive.
 */
import fs from "node:fs";
import path from "node:path";

// Only icon-shaped positions: a bare literal scan would sweep in unrelated
// words ("grape" is a Mantine colour, "cat" a language code).
const PATTERNS = [
  /\bname\s*[:=]\s*"([a-z0-9-]+)"/g,
  /\bname\s*=\s*\{([^}]*)\}/g,
  /\b\w*icon\w*\s*[:=]\s*"([a-z0-9-]+)"/gi,
  /\b\w*icon\w*\s*=\s*\{([^}]*)\}/gi,
];

/**
 * Icon names declared in one `*.generated.ts` registry file.
 * @param {string} file
 * @returns {string[]}
 */
export function registryNames(file) {
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(/^ {2}"([^"]+)": \{ viewBox:/gm)].map((m) => m[1]);
}

/**
 * @param {string} srcDir editor/src
 * @param {Set<string>} known every registry name
 * @returns {Set<string>} the members of `known` that source references
 */
export function scanUsedIcons(srcDir, known) {
  const found = new Set();
  // core/icons writes every name down (the registry itself, the galleries), so
  // reading it back would report the whole set as used.
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
      // A file that names the IconName type is an icon table (lookup maps,
      // registries): every literal in it is a candidate. Everything else only
      // contributes literals sitting in an icon-shaped position.
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
