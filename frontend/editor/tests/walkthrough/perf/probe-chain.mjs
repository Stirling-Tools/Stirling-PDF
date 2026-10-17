import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4180/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  globalThis.__lcp = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        globalThis.__lcp.push({
          t: Math.round(e.startTime),
          size: e.size,
          el: e.element ? `${e.element.tagName}.${e.element.className}` : "?",
          text: (e.element?.textContent ?? "").slice(0, 50),
        });
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  globalThis.__long = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        globalThis.__long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) });
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  globalThis.__marks = [];
  addEventListener("mark", () => {}, true);
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(5000);

const out = await page.evaluate(() => {
  const short = (n) =>
    n
      .replace(location.origin, "")
      .replace(/^\/assets\//, "")
      .replace(/^\/locales\//, "");
  return {
    lcp: globalThis.__lcp,
    long: globalThis.__long,
    paints: performance.getEntriesByType("paint").map((e) => ({ n: e.name, t: Math.round(e.startTime) })),
    resources: performance
      .getEntriesByType("resource")
      .filter((e) => /\.(js|css|toml|json|wasm|ico|woff2?)$|api\/v1/.test(e.name))
      .map((e) => ({
        n: short(e.name.split("?")[0]),
        start: Math.round(e.startTime),
        end: Math.round(e.responseEnd),
        kb: Math.round(e.decodedBodySize / 1024),
        init: e.initiatorType,
      }))
      .sort((a, b) => a.start - b.start),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
