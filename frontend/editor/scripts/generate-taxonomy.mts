/**
 * Generates the engine's default classification taxonomy JSON from the type-safe
 * TS source of truth (src/proprietary/data/classificationTaxonomy.ts).
 *
 * The Python engine can't import TypeScript, so it reads the generated JSON at
 * startup. Editing the .ts and regenerating keeps the two in lockstep — the .ts
 * is type-checked, so a malformed entry fails the build rather than shipping.
 *
 * Run: `npx tsx editor/scripts/generate-taxonomy.mts`         (writes the JSON)
 *      `npx tsx editor/scripts/generate-taxonomy.mts --check` (CI drift guard)
 *
 * .mts (not .ts) so `import.meta.url` resolves paths relative to this script —
 * Task invokes it from the workspace root (frontend/), same as setup-env.mts.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// frontend/package.json has no "type": "module", so tsx treats the source .ts as
// CommonJS. require() it (tsx hooks require for .ts) to read its named export
// reliably — a named ESM import can't see the export of a CJS-interpreted file.
const require = createRequire(import.meta.url);
const {
  DEFAULT_CLASSIFICATION_TAXONOMY,
} = require("../src/proprietary/data/classificationTaxonomy");

const here = dirname(fileURLToPath(import.meta.url));
// editor/scripts -> repo root is three levels up (scripts -> editor -> frontend).
const repoRoot = resolve(here, "../../..");
const outPath = resolve(
  repoRoot,
  "engine/src/stirling/agents/default_taxonomy.generated.json",
);

const NOTICE =
  "AUTO-GENERATED from frontend/editor/src/proprietary/data/classificationTaxonomy.ts " +
  "by editor/scripts/generate-taxonomy.mts — do NOT edit by hand; run `task frontend:taxonomy`.";
const json =
  JSON.stringify(
    { _generated: NOTICE, ...DEFAULT_CLASSIFICATION_TAXONOMY },
    null,
    2,
  ) + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
  if (current !== json) {
    console.error(
      "default_taxonomy.generated.json is stale. Run `task frontend:taxonomy` " +
        "(npx tsx editor/scripts/generate-taxonomy.mts).",
    );
    process.exit(1);
  }
  console.log("default_taxonomy.generated.json is up to date.");
} else {
  writeFileSync(outPath, json);
  const categories = DEFAULT_CLASSIFICATION_TAXONOMY.categories.length;
  const tags = DEFAULT_CLASSIFICATION_TAXONOMY.tags.length;
  console.log(
    `Wrote ${outPath}\n  ${categories} categories, ${tags} loose tags`,
  );
}
