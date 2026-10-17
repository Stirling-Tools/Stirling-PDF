/**
 * Opens the tools whose colour controls moved out of the preloaded chunk and
 * checks the control still mounts and responds, so the placement change is
 * verified in a real browser rather than in the emitted chunk graph alone.
 *
 * Usage, from frontend/editor:
 *   node tests/walkthrough/perf/probe-color-tool-smoke.mjs [base] [out.json]
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:4181";
const out = process.argv[3];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("requestfailed", (request) =>
  failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ""}`),
);

const steps = [];

async function openTool(toolId) {
  await page.goto(`${base}/?tool=${toolId}`, { waitUntil: "load" });
  await page.waitForSelector(".app-frame, .tool-picker-scrollable", {
    timeout: 30_000,
  });
}

/** ColorInput: the swatch input, its popover, and a typed value surviving. */
async function colorInputFlow() {
  await openTool("replaceColor");
  const input = page.locator('input[class*="ColorInput-input"]').first();
  await input.waitFor({ state: "visible", timeout: 30_000 });
  steps.push({ step: "replaceColor input visible", ok: true });

  await input.click();
  const saturation = page.locator('[class*="ColorPicker-saturation"]').first();
  await saturation.waitFor({ state: "visible", timeout: 15_000 });
  const pickerBox = await saturation.boundingBox();
  if (!pickerBox) throw new Error("colour picker has no layout box");
  await page.mouse.click(
    pickerBox.x + pickerBox.width * 0.7,
    pickerBox.y + pickerBox.height * 0.3,
  );
  const picked = await input.inputValue();
  steps.push({ step: "replaceColor popover picker", ok: true, picked });

  await page.keyboard.press("Escape");
  await input.fill("#123456");
  await input.blur();
  const typed = await input.inputValue();
  if (!/^#?123456$/i.test(typed))
    throw new Error(`typed value did not stick: ${typed}`);
  steps.push({ step: "replaceColor typed value", ok: true, typed });
}

/** ColorPicker rendered inline by a tool panel. */
async function colorPickerFlow() {
  await openTool("redact");
  const picker = page.locator('[class*="ColorPicker-saturation"]').first();
  await picker.waitFor({ state: "visible", timeout: 30_000 });
  const box = await picker.boundingBox();
  if (!box) throw new Error("inline colour picker has no layout box");
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  const hue = await page
    .locator('[class*="ColorPicker-hue"] input, [class*="ColorPicker-hue"]')
    .first()
    .isVisible();
  steps.push({ step: "redact inline picker", ok: true, hueVisible: hue });
}

try {
  await colorInputFlow();
} catch (error) {
  steps.push({ step: "replaceColor flow", ok: false, error: String(error) });
}
try {
  await colorPickerFlow();
} catch (error) {
  steps.push({ step: "redact flow", ok: false, error: String(error) });
}

const report = { steps, consoleErrors, pageErrors, failedRequests };
console.log(JSON.stringify(report, null, 1));
if (out) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
await browser.close();
