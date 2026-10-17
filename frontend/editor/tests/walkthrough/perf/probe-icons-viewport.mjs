/**
 * Records every icon name the app renders at a given viewport, so the startup
 * subset can be recorded for widths other than the desktop probe's 1440x900.
 *
 * Requires the temporary recorder in src/core/ui/Icon.tsx.
 *
 * Usage, from frontend/editor:
 *   node tests/walkthrough/perf/probe-icons-viewport.mjs <url> <width> <height> [out.json]
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4181/";
const width = Number(process.argv[3] ?? 412);
const height = Number(process.argv[4] ?? 915);
const out = process.argv[5];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width, height },
  isMobile: width < 700,
  hasTouch: width < 700,
  deviceScaleFactor: width < 700 ? 2 : 1,
});

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2500);
const afterPaint = await page.evaluate(
  () => globalThis.__icons?.size ?? -1,
);

await page.keyboard.press("Escape");
const scrollable = page.locator(".tool-picker-scrollable");
if (await scrollable.count()) {
  await scrollable.first().hover();
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(400);
}
for (const label of ["Add Files", "Process a folder", "Notifications", "Settings"]) {
  const target = page.getByText(label, { exact: false }).first();
  try {
    if (await target.count()) await target.hover({ timeout: 2000 });
  } catch {
    /* the label may not be reachable at this width */
  }
}
const menu = page.locator("button:visible");
const seen = new Set();
for (let i = 0; i < Math.min(await menu.count(), 40); i += 1) {
  const button = menu.nth(i);
  try {
    await button.hover({ timeout: 1000 });
  } catch {
    /* off-screen */
  }
  seen.add(i);
}
await page.keyboard.press("Meta+k");
await page.waitForTimeout(800);
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);

const result = await page.evaluate(() => ({
  rendered: [...(globalThis.__icons ?? [])].sort(),
  inDom: [...document.querySelectorAll("svg[data-missing-icon]")].map((svg) =>
    svg.getAttribute("data-missing-icon"),
  ),
}));

console.log(
  JSON.stringify(
    {
      viewport: `${width}x${height}`,
      renderedAfterInitialPaintOnly: afterPaint,
      renderedCount: result.rendered.length,
      missingInDom: result.inDom,
      names: result.rendered,
    },
    null,
    1,
  ),
);
if (out) writeFileSync(out, `${JSON.stringify(result.rendered, null, 0)}\n`);
await browser.close();
