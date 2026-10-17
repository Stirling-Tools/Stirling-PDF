// Diagnostic: is the ~11.8 MB a single PDF costs the library (measured by
// document-retention.mjs) per-file and unbounded, or a one-time cache warm-up?
// Uploads N copies with distinct names, settles after each add, deletes each via
// the kebab menu, settles after each delete, and prints both curves.
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.WALKTHROUGH_BASE_URL ?? "http://localhost:4181";
const SOURCE = resolve(import.meta.dirname, "../../../src/core/tests/test-fixtures/user-sample.pdf");
const TMP = "/private/var/folders/10/4hn925296yx_fqxp5g2z__v40000gn/T/opencode/churn";
const COPIES = Number(process.env.CHURN_FILES ?? 4);

mkdirSync(TMP, { recursive: true });
const fixtures = [];
for (let i = 1; i <= COPIES; i += 1) {
  const name = `churn-${i}.pdf`;
  copyFileSync(SOURCE, join(TMP, name));
  fixtures.push(join(TMP, name));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("HeapProfiler.enable");

async function settle() {
  await cdp.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 250));
  await cdp.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 250));
  const { metrics } = await cdp.send("Performance.getMetrics");
  const byName = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  const pageSide = await page.evaluate(() => ({
    elements: document.querySelectorAll("*").length,
    rows: document.querySelectorAll(".file-sidebar-file-item").length,
    viewerOpen: Boolean(document.querySelector(".pdf-viewer-toolbar-dock")),
  }));
  return {
    heapMB: Number((byName.JSHeapUsedSize / 1024 / 1024).toFixed(2)),
    cdpNodes: byName.Nodes,
    docs: byName.Documents,
    ...pageSide,
  };
}

const log = (label, s) => console.log(`[${label}] ${JSON.stringify(s)}`);

await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="files-button"]', { timeout: 30000 });
const empty = await settle();
log("empty", empty);
// Opening the library panel is itself a lazy load, so the per-file cost must be
// measured against a library that is open and empty, not against the landing.
await page.locator('[data-testid="files-button"]').click();
await page.locator('[data-testid="file-input"]').waitFor({ state: "attached", timeout: 15000 });
const libraryOpenEmpty = await settle();
log("library-open-empty", libraryOpenEmpty);

// Uploading a PDF auto-opens the viewer; the workbench bar's own "Close PDF"
// button is the addressable way back to the library.
async function closeViewerIfOpen() {
  if (!(await page.locator(".pdf-viewer-toolbar-dock").isVisible().catch(() => false))) return;
  const close = page.locator('button[aria-label="Close PDF"]');
  if (await close.count()) {
    await close.first().click();
  } else {
    console.log("[warn] viewer open but no Close PDF button found");
  }
  await page.waitForSelector(".pdf-viewer-toolbar-dock", { state: "hidden", timeout: 15000 });
}

async function upload(file) {
  // The file input is intentionally hidden, so its own visibility says nothing;
  // the sidebar's own upload button is what reveals the library panel.
  if (!(await page.locator('[data-testid="file-input"]').count())) {
    await page.locator('[data-testid="files-button"]').click();
  }
  await page.locator('[data-testid="file-input"]').waitFor({ state: "attached", timeout: 15000 });
  const before = await page.locator(".file-sidebar-file-item").count();
  await page.locator('[data-testid="file-input"]').setInputFiles(file);
  await page.waitForFunction(
    (n) => document.querySelectorAll(".file-sidebar-file-item").length > n,
    before,
    { timeout: 30000 },
  );
  await page.waitForTimeout(500);
  await closeViewerIfOpen();
}

async function deleteFirstRow(diagnose = false) {
  const row = page.locator(".file-sidebar-file-item").first();
  const name = (await row.innerText().catch(() => "")).split("\n")[0];
  const before = await page.locator(".file-sidebar-file-item").count();
  await row.hover();
  await row.locator(".file-sidebar-kebab-btn").click();
  const item = page.locator(".mantine-Menu-item").filter({ hasText: /^Delete$/ });
  await item.waitFor({ state: "visible", timeout: 10000 });
  await item.click();
  if (diagnose) {
    const dom = await page.evaluate(() => ({
      modals: [...document.querySelectorAll(".mantine-Modal-content, [role='dialog'], .mantine-Modal-root")].map((n) => n.className),
      buttons: [...document.querySelectorAll("button")].map((b) => ({ text: b.innerText.trim(), testid: b.getAttribute("data-testid") })).filter((b) => b.text),
    }));
    console.log(`[diagnose] ${JSON.stringify(dom)}`);
  }
  const confirm = page
    .locator(".mantine-Modal-content button, [role='dialog'] button")
    .filter({ hasText: /^(Delete|Confirm|Yes)/ })
    .last();
  let clicked = "n/a";
  try {
    await confirm.click({ timeout: 10000 });
    clicked = "clicked";
  } catch (error) {
    clicked = `failed: ${error.message.split("\n")[0]}`;
  }
  const detached = await row
    .waitFor({ state: "detached", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  const after = await page.locator(".file-sidebar-file-item").count();
  console.log(`[delete] "${name}" ${clicked} rows ${before}→${after} detached=${detached}`);
}

const curve = { adds: [], deletes: [] };
for (let i = 0; i < fixtures.length; i += 1) {
  await upload(fixtures[i]);
  const state = await settle();
  curve.adds.push(state);
  log(`add-${i + 1}`, state);
}
// Close whatever the last upload opened, then take the library-idle reading.
await closeViewerIfOpen();
const libraryIdle = await settle();
log("library-idle", libraryIdle);

for (let i = 0; i < fixtures.length; i += 1) {
  await deleteFirstRow(i === 0);
  const state = await settle();
  curve.deletes.push(state);
  log(`delete-${i + 1}`, state);
}

const afterAll = await settle();
log("after-all", afterAll);
console.log(
  `[summary] ${JSON.stringify({
    emptyMB: empty.heapMB,
    libraryOpenEmptyMB: libraryOpenEmpty.heapMB,
    libraryPanelCostMB: Number((libraryOpenEmpty.heapMB - empty.heapMB).toFixed(2)),
    libraryIdleMB: libraryIdle.heapMB,
    perFileAddMB: curve.adds.map((s) => Number((s.heapMB - libraryOpenEmpty.heapMB).toFixed(2))),
    libraryMB: Number((libraryIdle.heapMB - libraryOpenEmpty.heapMB).toFixed(2)),
    releasedPerDeleteMB: curve.deletes.map((s, i) => {
      const prev = i === 0 ? libraryIdle.heapMB : curve.deletes[i - 1].heapMB;
      return Number((prev - s.heapMB).toFixed(2));
    }),
    emptyLibraryAfterAllMB: Number((afterAll.heapMB - libraryOpenEmpty.heapMB).toFixed(2)),
    finalAboveLandingMB: Number((afterAll.heapMB - empty.heapMB).toFixed(2)),
    emptyElements: empty.elements,
    libraryOpenEmptyElements: libraryOpenEmpty.elements,
    finalElements: afterAll.elements,
    rowsFinally: afterAll.rows,
  })}`,
);

await browser.close();
