/**
 * Distinguishes a shell paint from a React paint under the same throttling
 * Lighthouse's mobile preset uses (150 ms RTT, 1.6 Mbps down, 4x CPU).
 *
 * node tests/walkthrough/perf/probe-lcp.mjs            # normal
 * node tests/walkthrough/perf/probe-lcp.mjs --no-js    # module scripts blocked
 */
import { chromium } from "playwright";

const url = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:4181/";
const blockJs = process.argv.includes("--no-js");

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 412, height: 823 },
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

if (blockJs) {
  await page.route("**/*.js", (route) => route.abort());
  await page.route("**/assets/*", (route) => route.abort());
}

const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

await page.addInitScript(() => {
  const snap = () => {
    const root = document.getElementById("root");
    return {
      shellFrame: Boolean(document.querySelector("[data-shell-frame]")),
      shellAttr: root ? root.getAttribute("data-shell") : "no-root",
    };
  };
  window.__events = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__events.push({
        kind: "paint",
        name: entry.name,
        time: Math.round(entry.startTime),
        ...snap(),
      });
    }
  }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const el = entry.element;
      window.__events.push({
        kind: "lcp",
        name: "largest-contentful-paint",
        time: Math.round(entry.startTime),
        size: entry.size,
        tag: el ? el.tagName : null,
        cls: el ? (el.className || "").toString().slice(0, 50) : null,
        text: el ? (el.textContent || "").trim().slice(0, 50) : null,
        ...snap(),
      });
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3000);

const result = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  return {
    blockJs: false,
    events: window.__events,
    timing: {
      responseEnd: Math.round(nav.responseEnd),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
    },
    resources: performance
      .getEntriesByType("resource")
      .map((r) => ({
        name: r.name.replace(location.origin, ""),
        start: Math.round(r.startTime),
        end: Math.round(r.responseEnd),
        transfer: r.transferSize,
      }))
      .filter((r) => r.transfer > 0)
      .sort((a, b) => a.start - b.start),
    rootNow: (() => {
      const root = document.getElementById("root");
      return {
        shellFrame: Boolean(document.querySelector("[data-shell-frame]")),
        shellAttr: root ? root.getAttribute("data-shell") : "no-root",
        children: root ? root.children.length : 0,
      };
    })(),
  };
});

console.log(`--- blockJs=${blockJs} ---`);
console.log(JSON.stringify(result, null, 1));
await browser.close();
