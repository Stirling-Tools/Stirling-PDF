/**
 * Precise V8 coverage over the boot window, to rank code that ships in the preloaded
 * chunks but never executes. Output feeds $T/covmap.py, which attributes the unused
 * ranges to source modules through the chunk sourcemaps.
 *
 * Run from frontend/editor: node tests/walkthrough/perf/probe-coverage.mjs [url] [--out file] [--settle ms]
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const url = args.find((arg) => arg.startsWith("http")) ?? "http://localhost:4181/";
const outFlag = args.indexOf("--out");
const out = outFlag > -1 ? args[outFlag + 1] : "/tmp/cov.json";
const settleFlag = args.indexOf("--settle");
const settle = settleFlag > -1 ? Number(args[settleFlag + 1]) : 2500;

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await cdp.send("Profiler.enable");
await cdp.send("Profiler.startPreciseCoverage", { callCount: false, detailed: true });

const started = Date.now();
await page.goto(url, { waitUntil: "load" });
const loadMs = Date.now() - started;
await page.waitForLoadState("networkidle");
const idleMs = Date.now() - started;
// Boot completes asynchronously after networkidle; give the first paint a window to run
// its effects before the snapshot. This is a throwaway probe, not a gate.
await page.waitForTimeout(settle);

const { result } = await cdp.send("Profiler.takePreciseCoverage");
const scripts = result
  .filter((entry) => entry.url)
  .map((entry) => ({
    url: entry.url,
    functions: entry.functions.map((fn) => ({
      functionName: fn.functionName,
      isBlockCoverage: fn.isBlockCoverage,
      ranges: fn.ranges,
    })),
  }));

writeFileSync(out, JSON.stringify({ url, loadMs, idleMs, settle, scripts }));
const used = scripts.reduce((sum, script) => sum + script.functions.length, 0);
console.log(
  `${scripts.length} scripts / ${used} functions in coverage; load=${loadMs}ms idle=${idleMs}ms -> ${out}`,
);

await browser.close();
