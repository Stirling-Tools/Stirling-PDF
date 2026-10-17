/**
 * Records who asks for the locale files, with a stack, so an unexpected
 * pre-paint dictionary request can be attributed instead of guessed.
 *
 * Usage, from frontend/editor:
 *   node tests/walkthrough/perf/probe-fetchers.mjs http://127.0.0.1:4181/ [settleMs]
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4181/";
const settleMs = Number(process.argv[3] ?? 5000);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.addInitScript(() => {
  const hits = [];
  globalThis.__fetchHits = hits;
  const original = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    const target = typeof input === "string" ? input : input?.url;
    if (typeof target === "string" && target.includes("locales/")) {
      hits.push({
        t: performance.now(),
        url: target,
        stack: (new Error("stack").stack ?? "").split("\n").slice(1, 9),
      });
    }
    return original.call(this, input, init);
  };
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(settleMs);

const hits = await page.evaluate(() => globalThis.__fetchHits);
console.log(JSON.stringify(hits, null, 1));
await browser.close();
