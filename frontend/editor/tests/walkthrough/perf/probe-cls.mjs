import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4181/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.addInitScript(() => {
  const path = (node) => {
    if (!node || node.nodeType !== 1) return null;
    const parts = [];
    for (let el = node; el && el.nodeType === 1 && parts.length < 5; el = el.parentElement) {
      let step = el.tagName.toLowerCase();
      if (el.id) step += `#${el.id}`;
      else if (el.className && typeof el.className === "string") {
        const cls = el.className.trim().split(/\s+/).slice(0, 3).join(".");
        if (cls) step += `.${cls}`;
      }
      parts.unshift(step);
    }
    return parts.join(" > ");
  };
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      window.__shifts.push({
        t: Math.round(entry.startTime),
        value: Math.round(entry.value * 10000) / 10000,
        lastInput: entry.lastInputTime,
        sources: (entry.sources ?? []).map((s) => ({
          node: path(s.node),
          prev: s.previousRect && { y: Math.round(s.previousRect.y), h: Math.round(s.previousRect.height) },
          cur: s.currentRect && { y: Math.round(s.currentRect.y), h: Math.round(s.currentRect.height) },
        })),
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(5000);
const shifts = await page.evaluate(() => window.__shifts);
console.log(JSON.stringify(shifts, null, 1));
await browser.close();
