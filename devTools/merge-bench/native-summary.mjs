#!/usr/bin/env node
import fs from "node:fs";

const [mode, input, libPattern, out, mergesArg] = process.argv.slice(2);
const libs = new RegExp(libPattern);
const text = fs.readFileSync(input, "utf8");

if (mode === "leaf") {
  const lineRe = /^([\s+!:|]*?)(\d+) (.+?)\s+\(in ([^)]+)\)/;
  const stack = [];
  const nodes = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("Total number in stack") || line.startsWith("Sort by top of stack")) break;
    const m = lineRe.exec(line);
    if (!m) continue;
    const depth = m[1].length;
    const node = { depth, count: +m[2], symbol: m[3].trim(), lib: m[4], children: 0, named: null, inScope: false };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.children += node.count;
    node.named = node.symbol.startsWith("???") ? (parent ? parent.named : null) : node.symbol;
    node.inScope = libs.test(node.lib) || (parent ? parent.inScope : false);
    stack.push(node);
    nodes.push(node);
  }
  const self = new Map();
  let total = 0;
  for (const n of nodes) {
    const own = n.count - n.children;
    if (own <= 0 || !n.inScope) continue;
    const sym = n.symbol.startsWith("???") ? `[stripped] under ${n.named ?? "?"}` : n.symbol.replace(/\s+\+\s+\d+.*$/, "");
    const name = `${sym} (${n.lib})`;
    self.set(name, (self.get(name) ?? 0) + own);
    total += own;
  }
  const rows = [...self].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([name, samples]) => ({ name, samples, pct: +(100 * samples / Math.max(1, total)).toFixed(2) }));
  fs.writeFileSync(out, JSON.stringify({ total_samples: total, merges: +mergesArg || null, libs: libPattern, rows }, null, 1));
} else if (mode === "malloc") {
  const merges = +mergesArg;
  let total = 0, matched = 0, calls = 0, reserved = 0;
  const callRe = /^(\d+) calls? for (\d+) bytes: (.*)$/;
  for (const line of text.split("\n")) {
    const m = callRe.exec(line);
    if (!m) continue;
    const bytes = +m[2];
    total += bytes;
    if (!libs.test(m[3])) continue;
    const frames = m[3].split(" | ");
    if (frames[frames.length - 1].includes("(libsystem_malloc.dylib)")) { matched += bytes; calls += +m[1]; }
    else reserved += bytes;
  }
  const footprint = /Physical footprint:\s+([\d.]+)([KMG])/.exec(text);
  const peak = /Physical footprint \(peak\):\s+([\d.]+)([KMG])/.exec(text);
  const mb = (m) => m ? +m[1] * ({ K: 1 / 1024, M: 1, G: 1024 })[m[2]] : null;
  fs.writeFileSync(out, JSON.stringify({
    merges, libs: libPattern,
    live_total_mb: +(total / 1048576).toFixed(2),
    live_matched_mb: +(matched / 1048576).toFixed(4),
    live_matched_mb_per_merge: +(matched / 1048576 / merges).toFixed(4),
    live_matched_calls: calls,
    vm_reserved_matched_mb: +(reserved / 1048576).toFixed(1),
    footprint_mb: mb(footprint), footprint_peak_mb: mb(peak),
  }, null, 1));
} else {
  throw new Error(`unknown mode ${mode}`);
}
