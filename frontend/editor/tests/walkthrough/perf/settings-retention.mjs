// Diagnostic 2: does the harness's DOM/heap growth survive forced GC and a
// same-moment CDP Nodes cross-check? 3 Settings cycles, all readings printed.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4181";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("HeapProfiler.enable");

const metrics = async () => {
  const m = (await cdp.send("Performance.getMetrics")).metrics;
  const read = (n) => m.find((x) => x.name === n)?.value ?? 0;
  const dom = await page.evaluate(() => ({
    elements: document.querySelectorAll("*").length,
    textNodes: (() => {
      let n = 0;
      const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) n += 1;
      return n;
    })(),
  }));
  return {
    cdpNodes: read("Nodes"),
    cdpDocs: read("Documents"),
    cdpFrames: read("Frames"),
    cdpHeapMB: +(read("JSHeapUsedSize") / 1048576).toFixed(2),
    ...dom,
  };
};

const forcedHeapMB = async () => {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const m = (await cdp.send("Performance.getMetrics")).metrics;
  return +((m.find((x) => x.name === "JSHeapUsedSize")?.value ?? 0) / 1048576).toFixed(2);
};

await page.goto(`${BASE}/editor`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".tool-picker-scrollable", { state: "visible", timeout: 30000 });
await page.waitForTimeout(4000);
console.log("[baseline]", JSON.stringify(await metrics()), "forcedHeapMB", await forcedHeapMB());

for (let i = 1; i <= 3; i += 1) {
  await page.locator('[data-testid="config-button"]').first().click({ timeout: 15000 });
  await page.waitForSelector(".settings-page", { state: "visible", timeout: 10000 });
  await page.waitForSelector(".settings-page .modal-nav-item", { state: "visible", timeout: 10000 });
  const available = '.settings-page .modal-nav-item:not(.active):not([aria-disabled="true"])';
  await page.waitForSelector(available, { state: "visible", timeout: 10000 });
  await page.locator(available).first().click({ timeout: 10000 });
  await page.waitForFunction(() => {
    const active = document.querySelector(".settings-page .modal-nav-item.active");
    const title = document.querySelector(".settings-page__title");
    return Boolean(active && title && (title.textContent ?? "").trim().length > 0);
  }, null, { timeout: 10000 });
  console.log(`[cycle ${i}] open`, JSON.stringify(await metrics()));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const visible = await page.locator(".settings-page").first().isVisible().catch(() => false);
    if (!visible) break;
    await page.goBack({ timeout: 2000 }).catch(() => undefined);
    await page.waitForSelector(".settings-page", { state: "hidden", timeout: 3000 }).catch(() => undefined);
  }
  await page.waitForTimeout(4000);
  console.log(`[cycle ${i}] after-recovery`, JSON.stringify(await metrics()), "forcedHeapMB", await forcedHeapMB());
  console.log(`[cycle ${i}] after-GC-metrics`, JSON.stringify(await metrics()));
}

console.log("[route]", new URL(page.url()).pathname);
await browser.close();
