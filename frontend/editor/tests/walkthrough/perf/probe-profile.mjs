import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";
const WINDOW_MS = Number(process.argv[3] ?? 600);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);

await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
await cdp.send("Profiler.start");
const navStart = Date.now();
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(4000);
const { profile } = await cdp.send("Profiler.stop");

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const windowed = new Map();
let t = profile.startTime / 1000;
const total = profile.timeDeltas.reduce((a, b) => a + b, 0);
const samples = profile.samples ?? [];
for (let i = 0; i < samples.length; i++) {
  const node = byId.get(samples[i]);
  const dt = profile.timeDeltas[i] ?? 0;
  const ms = dt / 1000;
  t += ms;
  if (!node) continue;
  const cf = node.callFrame;
  const url_ = (cf.url || "").split("/").slice(-1)[0] || "(native)";
  const key = `${cf.functionName || "(anonymous)"} @ ${url_}`;
  self.set(key, (self.get(key) ?? 0) + ms);
  const rel = t - profile.startTime / 1000;
  if (rel <= WINDOW_MS) windowed.set(key, (windowed.get(key) ?? 0) + ms);
}
const top = (m, n) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(1)}ms  ${k}`);

console.log(`total profiled ${(total / 1000).toFixed(0)}ms; wall ${Date.now() - navStart}ms`);
console.log(`\n--- self time in first ${WINDOW_MS}ms after profiling start ---`);
console.log(top(windowed, 22).join("\n"));
console.log(`\n--- self time, whole trace ---`);
console.log(top(self, 18).join("\n"));

console.log(`\n--- 50ms buckets, top function per bucket ---`);
const buckets = new Map();
t = profile.startTime / 1000;
for (let i = 0; i < samples.length; i++) {
  const node = byId.get(samples[i]);
  const ms = (profile.timeDeltas[i] ?? 0) / 1000;
  const rel = t - profile.startTime / 1000;
  t += ms;
  if (rel > WINDOW_MS || !node) continue;
  const b = Math.floor(rel / 50) * 50;
  const cf = node.callFrame;
  const url_ = (cf.url || "").split("/").slice(-1)[0] || "(native)";
  const key = `${cf.functionName || "(anonymous)"} @ ${url_}`;
  const m = buckets.get(b) ?? new Map();
  m.set(key, (m.get(key) ?? 0) + ms);
  buckets.set(b, m);
}
for (const b of [...buckets.keys()].sort((a, c) => a - c)) {
  const m = buckets.get(b);
  const sum = [...m.values()].reduce((a, c) => a + c, 0);
  const first = [...m.entries()].sort((a, c) => c[1] - a[1])[0];
  console.log(
    `${String(b).padStart(4)}-${b + 50}ms  busy=${sum.toFixed(0).padStart(3)}ms  ${first[1].toFixed(0).padStart(3)}ms ${first[0].slice(0, 70)}`,
  );
}
await browser.close();
