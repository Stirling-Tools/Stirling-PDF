// Diffs two suite.mjs outputs: status, content type, and response size within 2%.
// usage: node compare.mjs <a.json> <b.json>
import fs from "node:fs";

const [a, b] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, "utf8")).results);
let same = 0;
const diffs = [];
for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
  const x = a[k] || {};
  const y = b[k] || {};
  if (x.status !== y.status || x.ct !== y.ct) diffs.push([k, "status/type", `${x.status} ${x.ct}`, `${y.status} ${y.ct}`]);
  else if (x.len && y.len && Math.abs(x.len - y.len) / Math.max(x.len, y.len) > 0.02) diffs.push([k, "size", x.len, y.len]);
  else same++;
}
console.log(`${same} match, ${diffs.length} differ`);
for (const d of diffs) console.log("  " + d.join(" | "));
const chain = b["CHAIN cert-sign -> validate-signature"];
if (chain) console.log("cert-sign -> validate-signature:", chain.status, (chain.body || "").slice(0, 120));
process.exit(diffs.length ? 1 : 0);
