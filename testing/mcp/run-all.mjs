// Runs every client-side suite with the same arguments; exits non-zero if any suite failed.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

try {
  loadConfig(args);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const failed = [];
for (const suite of ["protocol.mjs", "sdk-v1.mjs", "eras.mjs"]) {
  console.log(`\n== ${suite}`);
  const run = spawnSync(process.execPath, [join(here, suite), ...args], { stdio: "inherit" });
  if (run.status !== 0) failed.push(suite);
}
console.log(failed.length ? `\nFAILED: ${failed.join(", ")}` : "\nALL SUITES PASSED");
process.exit(failed.length ? 1 : 0);
