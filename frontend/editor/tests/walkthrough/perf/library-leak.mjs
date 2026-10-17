// Diagnostic: what does the library keep after files are added and deleted?
// Two heap snapshots (library open and empty, then again after N add/delete
// cycles, both GC-settled) so the leak can be attributed to a constructor
// instead of guessed at. Diff with $T/heapdiff3.py.
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.WALKTHROUGH_BASE_URL ?? "http://localhost:4181";
const SOURCE = resolve(import.meta.dirname, "../../../src/core/tests/test-fixtures/user-sample.pdf");
const TMP = "/private/var/folders/10/4hn925296yx_fqxp5g2z__v40000gn/T/opencode/churn";
const OUT = "/private/var/folders/10/4hn925296yx_fqxp5g2z__v40000gn/T/opencode/heap";
const COPIES = Number(process.env.CHURN_FILES ?? 6);

mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
const fixtures = [];
for (let i = 1; i <= COPIES; i += 1) {
  const name = `leak-${i}.pdf`;
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

async function snapshot(tag) {
  const chunks = [];
  const onChunk = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 250));
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  const path = join(OUT, `${tag}.heapsnapshot`);
  writeFileSync(path, chunks.join(""));
  console.log(`[snapshot] ${tag} -> ${path} (${(chunks.join("").length / 1e6).toFixed(1)} MB json)`);
}

async function closeViewerIfOpen() {
  if (!(await page.locator(".pdf-viewer-toolbar-dock").isVisible().catch(() => false))) return;
  await page.locator('button[aria-label="Close PDF"]').first().click();
  await page.waitForSelector(".pdf-viewer-toolbar-dock", { state: "hidden", timeout: 15000 });
}

async function upload(file) {
  if (!(await page.locator('[data-testid="file-input"]').count())) {
    await page.locator('[data-testid="files-button"]').click();
  }
  await page.locator('[data-testid="file-input"]').waitFor({ state: "attached", timeout: 15000 });
  const before = await page.locator(".file-sidebar-file-item").count();
  await page.locator('[data-testid="file-input"]').setInputFiles(file);
  await page.waitForFunction((n) => document.querySelectorAll(".file-sidebar-file-item").length > n, before, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
  await closeViewerIfOpen();
}

// Deleting needs no confirm dialog in this build: the kebab's Delete item acts.
async function deleteFirstRow() {
  const row = page.locator(".file-sidebar-file-item").first();
  const before = await page.locator(".file-sidebar-file-item").count();
  await row.hover();
  await row.locator(".file-sidebar-kebab-btn").click();
  await page.locator(".mantine-Menu-item").filter({ hasText: /^Delete$/ }).click();
  const after = await page
    .waitForFunction((n) => document.querySelectorAll(".file-sidebar-file-item").length < n, before, {
      timeout: 15000,
    })
    .then(() => page.locator(".file-sidebar-file-item").count())
    .catch(() => page.locator(".file-sidebar-file-item").count());
  console.log(`[delete] rows ${before}→${after}`);
}

await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="files-button"]', { timeout: 30000 });
await page.locator('[data-testid="files-button"]').click();
await page.locator('[data-testid="file-input"]').waitFor({ state: "attached", timeout: 15000 });
const libraryOpenEmpty = await settle();
console.log(`[library-open-empty] ${JSON.stringify(libraryOpenEmpty)}`);
await snapshot("libempty");

for (const file of fixtures) await upload(file);
await closeViewerIfOpen();
console.log(`[library-idle] ${JSON.stringify(await settle())}`);

for (const _ of fixtures) await deleteFirstRow();
const afterAll = await settle();
console.log(`[after-all] ${JSON.stringify(afterAll)}`);
console.log(
  `[summary] ${JSON.stringify({
    libraryOpenEmptyMB: libraryOpenEmpty.heapMB,
    afterAllMB: afterAll.heapMB,
    retainedMB: Number((afterAll.heapMB - libraryOpenEmpty.heapMB).toFixed(2)),
    perFileMB: Number(((afterAll.heapMB - libraryOpenEmpty.heapMB) / fixtures.length).toFixed(2)),
    elements: `${libraryOpenEmpty.elements} -> ${afterAll.elements}`,
    rowsFinally: afterAll.rows,
  })}`,
);
await snapshot("libchurn");

await browser.close();
