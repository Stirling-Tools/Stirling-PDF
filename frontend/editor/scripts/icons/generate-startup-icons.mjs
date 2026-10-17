import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// oxlint-disable-next-line no-restricted-imports -- sibling build script; no alias covers scripts/
import { renderStartupIcons } from "./startupIcons.mjs";

const target = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/core/icons/startupIcons.generated.ts",
);
writeFileSync(target, renderStartupIcons());
console.log(`wrote ${target}`);
