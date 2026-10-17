// Diagnostic: what does one Settings open/close retain? Two heap snapshots
// (before / after the cycle, GC forced) plus a DOM signature diff.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:4181";
const OUT = process.env.OUT_DIR ?? "/private/var/folders/10/4hn925296yx_fqxp5g2z__v40000gn/T/opencode/heap";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send("HeapProfiler.enable");
await cdp.send("Performance.enable");

async function snap(tag) {
  const chunks = [];
  const onChunk = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  const path = `${OUT}/${tag}.heapsnapshot`;
  writeFileSync(path, chunks.join(""));
  const m = (await cdp.send("Performance.getMetrics")).metrics;
  const used = m.find((x) => x.name === "JSHeapUsedSize")?.value;
  console.log(`[snap] ${tag}: ${(chunks.join("").length / 1e6).toFixed(1)} MB json, JSHeapUsedSize=${(used / 1048576).toFixed(2)} MB`);
  return path;
}

const domSig = () =>
  page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll("*")) {
      const key = [
        el.tagName,
        el.id ? `#${el.id}` : "",
        el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : "",
        (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).join("."),
      ].join("");
      out[key] = (out[key] ?? 0) + 1;
    }
    out["__total"] = document.querySelectorAll("*").length;
    return out;
  });

async function cycle(n) {
  const closeSettings = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const visible = await page.locator(".settings-page").first().isVisible().catch(() => false);
      if (!visible) return;
      await page.goBack({ timeout: 2000 }).catch(() => undefined);
      await page.waitForSelector(".settings-page", { state: "hidden", timeout: 3000 }).catch(() => undefined);
    }
  };
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
  await closeSettings();
  console.log(`[cycle ${n}] closed, nodes=${(await domSig()).__total}`);
}

await page.goto(`${BASE}/editor`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".tool-picker-scrollable", { state: "visible", timeout: 30000 });
await page.waitForTimeout(2000);
const before = await domSig();
await snap("baseline");

for (let i = 1; i <= 2; i += 1) {
  await cycle(i);
  await page.waitForTimeout(1500);
  const after = await domSig();
  const added = Object.entries(after)
    .filter(([k, v]) => k !== "__total" && v - (before[k] ?? 0) > 0)
    .map(([k, v]) => [k, v - (before[k] ?? 0)])
    .sort((a, b) => b[1] - a[1]);
  console.log(`[dom after cycle ${i}] total ${before.__total} -> ${after.__total}`);
  console.log(added.slice(0, 15).map(([k, v]) => `   +${v} ${k}`).join("\n"));
}

await snap("after-settings");

await browser.close();
