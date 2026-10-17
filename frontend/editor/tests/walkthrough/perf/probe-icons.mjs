/**
 * Counts the icons the landing surface actually renders, so the "make the icon
 * registry lazy" question can be sized before any of it is built. Needs the
 * temporary recorder in src/core/ui/Icon.tsx (globalThis.__icons).
 *
 * Usage, from frontend/editor:
 *   node tests/walkthrough/perf/probe-icons.mjs http://127.0.0.1:4181/ [out.json]
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4181/";
const out = process.argv[3];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2500);

const baseline = await page.evaluate(() => [...(globalThis.__icons ?? [])].length);

// Everything the landing screen offers without a document: the tool picker and
// its scroll, a tool card's hover state, the command palette, the sidebar.
const steps = [
  async () => page.keyboard.press("Escape"),
  async () => {
    const picker = page.locator(".tool-picker-scrollable").first();
    if (await picker.count()) {
      await picker.hover();
      await page.mouse.wheel(0, 1200);
    }
  },
  async () => {
    const cards = page.locator(".tool-picker-scrollable button, .tool-picker-scrollable a");
    const count = Math.min(await cards.count(), 40);
    for (let i = 0; i < count; i += 1) {
      await cards.nth(i).hover({ timeout: 800 }).catch(() => {});
    }
  },
  async () => {
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
  },
  async () => {
    for (const label of ["Add Files", "Process a folder", "Notifications", "Settings"]) {
      const el = page.getByText(label, { exact: false }).first();
      if (await el.count()) await el.hover({ timeout: 800 }).catch(() => {});
    }
  },
];
for (const step of steps) {
  try {
    await step();
  } catch {
    /* the landing screen may not offer this control */
  }
}
await page.waitForTimeout(1200);

const result = await page.evaluate(() => ({
  rendered: [...(globalThis.__icons ?? [])].sort(),
  inDom: new Set(
    [...document.querySelectorAll("svg")].map((svg) => svg.getAttribute("data-icon")),
  ).size,
}));

console.log(
  JSON.stringify(
    {
      renderedCount: result.rendered.length,
      renderedAfterInitialPaintOnly: baseline,
      names: result.rendered,
    },
    null,
    1,
  ),
);
if (out) writeFileSync(out, `${JSON.stringify(result.rendered, null, 1)}\n`);
await browser.close();
