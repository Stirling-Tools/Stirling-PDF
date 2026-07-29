// Counts crash-class failures in one Vitest JSON report: stories that failed
// with no axe rule anywhere in the message (a throw, a timeout, a dropped
// browser page — anything that isn't an accessibility result). a11y-scan.sh
// retries a batch once when this is non-zero, since a one-off infrastructure
// death is indistinguishable from a real render crash until it's re-run.
//
//   node a11y-crash-count.mjs <report.json>   → prints the count
import { readFileSync } from "node:fs";

const RULE_URL = /dequeuniversity\.com\/rules\/axe\//;

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
let crashes = 0;
for (const tf of report.testResults ?? []) {
  for (const a of tf.assertionResults ?? []) {
    if (a.status === "passed") continue;
    const msg = (a.failureMessages ?? []).join("\n");
    if (!RULE_URL.test(msg)) crashes++;
  }
}
console.log(crashes);
