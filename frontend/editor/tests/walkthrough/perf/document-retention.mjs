// Diagnostic 3: the viewer's document cycle ends 13.6 MB above an empty
// landing. Is that the library holding the file, or does each viewer open
// leave something behind? Upload -> close the viewer (library idle) -> then
// open/close three times, with a forced GC before every reading.
// Prints what it can see, never throws on a missing selector, so a wrong
// assumption is visible instead of fatal.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4181";
const PDF = new URL("../../../src/core/tests/test-fixtures/user-sample.pdf", import.meta.url).pathname;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("HeapProfiler.enable");
await page.addInitScript(() => {
  window.__wtLongTasks = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__wtLongTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ entryTypes: ["longtask"] });
});

const read = (m, n) => m.find((x) => x.name === n)?.value ?? 0;

const settle = async () => {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const m = (await cdp.send("Performance.getMetrics")).metrics;
  const live = await page.evaluate(() => ({
    elements: document.querySelectorAll("*").length,
    iframes: document.querySelectorAll("iframe").length,
    viewerOpen: Boolean(document.querySelector(".pdf-viewer-toolbar-dock")),
  }));
  return {
    heapMB: +(read(m, "JSHeapUsedSize") / 1048576).toFixed(2),
    cdpNodes: read(m, "Nodes"),
    docs: read(m, "Documents"),
    ...live,
  };
};

let libraryIdle = null;
const report = async (label) => {
  const s = await settle();
  const rel = libraryIdle ? ` (+${(s.heapMB - libraryIdle.heapMB).toFixed(2)} MB vs library idle)` : "";
  console.log(`[${label}]`, JSON.stringify(s), rel);
  return s;
};

const eye = () => page.locator(".file-sidebar-file-item .file-sidebar-eye-btn").first();
const viewerOpen = () => page.locator(".pdf-viewer-toolbar-dock").first().isVisible().catch(() => false);
const openViewer = async () => {
  if (await viewerOpen()) return;
  await eye().click({ timeout: 15000 });
  await page.locator(".pdf-viewer-toolbar-dock").first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll("iframe").length > 0, null, { timeout: 30000 });
};
const closeViewer = async () => {
  if (!(await viewerOpen())) return;
  await eye().click({ timeout: 15000 });
  await page.locator(".pdf-viewer-toolbar-dock").first().waitFor({ state: "hidden", timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll("iframe").length === 0, null, { timeout: 20000 });
};

await page.goto(`${BASE}/editor`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".tool-picker-scrollable", { state: "visible", timeout: 30000 });
await page.waitForTimeout(4000);
const empty = await report("empty-landing");

await page.locator('[data-testid="files-button"]').first().click({ timeout: 15000 });
await page.locator('[data-testid="file-input"]').setInputFiles(PDF);
await page.waitForSelector(".file-sidebar-file-item", { state: "visible", timeout: 30000 });
await page.waitForTimeout(4000);
await report("uploaded-viewer-open");

await closeViewer();
await page.waitForTimeout(3000);
libraryIdle = await report("library-idle");
console.log(`[gate] library costs +${(libraryIdle.heapMB - empty.heapMB).toFixed(2)} MB over an empty landing`);

const perCycle = [];
for (let i = 1; i <= 6; i += 1) {
  await openViewer();
  await page.waitForTimeout(4000);
  const open = await report(`cycle${i}-open`);
  await closeViewer();
  await page.waitForTimeout(3000);
  const closed = await report(`cycle${i}-closed`);
  perCycle.push({ i, openDelta: +(open.heapMB - libraryIdle.heapMB).toFixed(2), closedDelta: +(closed.heapMB - libraryIdle.heapMB).toFixed(2) });
}

const longTasks = await page.evaluate(() => (window.__wtLongTasks ?? []).map((e) => ({ start: Math.round(e.start), dur: Math.round(e.duration) })));
console.log("[longtasks]", JSON.stringify(longTasks));

console.log("[summary]", JSON.stringify({
  emptyMB: empty.heapMB,
  libraryIdleMB: libraryIdle.heapMB,
  libraryCostMB: +(libraryIdle.heapMB - empty.heapMB).toFixed(2),
  emptyElements: empty.elements,
  libraryElements: libraryIdle.elements,
  perCycle,
}));

// Does the library give the file's memory back when the file leaves? A store
// entry that outlives its file is a leak; one that goes with it is the price of
// keeping the file open. Best effort: the menu and the dialog are the app's,
// and a selector that misses is logged rather than fatal.
await page.locator(".file-sidebar-kebab-btn").first().click({ timeout: 15000 }).catch(() => console.log("[step] kebab click failed"));
await page.waitForTimeout(1200);
const menuItems = await page.locator(".mantine-Menu-item").allTextContents().catch(() => []);
console.log("[step] kebab menu items", JSON.stringify(menuItems));
await page
  .locator(".mantine-Menu-item")
  .filter({ hasText: /^Delete$/ })
  .first()
  .click({ timeout: 10000 })
  .catch(() => console.log("[step] delete menu item click failed"));
await page.waitForTimeout(1500);
const dialogButtons = await page.locator(".mantine-Modal-content button").allTextContents().catch(() => []);
console.log("[step] dialog buttons", JSON.stringify(dialogButtons));
await page
  .locator(".mantine-Modal-content button")
  .filter({ hasText: /^Delete$/ })
  .last()
  .click({ timeout: 10000 })
  .catch(() => console.log("[step] confirm click failed"));
await page
  .waitForSelector(".file-sidebar-file-item", { state: "detached", timeout: 20000 })
  .catch(() => console.log("[step] file row still present after the delete confirm"));
await page.waitForTimeout(4000);
const deleted = await report("after-delete");
console.log("[delete]", JSON.stringify({
  deletedMB: deleted.heapMB,
  releasedMB: +(libraryIdle.heapMB - deleted.heapMB).toFixed(2),
  aboveEmptyMB: +(deleted.heapMB - empty.heapMB).toFixed(2),
  elements: deleted.elements,
}));

await browser.close();
