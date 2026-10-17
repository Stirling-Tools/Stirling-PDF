/**
 * Ad-hoc A/B probe for the colour controls on the `replaceColor` tool surface.
 * Not part of the harness: used once to compare the moved Mantine ColorInput /
 * ColorPicker against the build without the deep-import rewrite. Every detector
 * is visibility-aware, because Mantine keeps closed popovers mounted.
 */
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  bypassOnboarding,
  fulfillUnstubbedApis,
  mockAppApis,
  seedCookieConsent,
} from "@app/tests/helpers/api-stubs";

const baseUrl = process.argv[2] ?? "http://localhost:4181";
const route = process.argv[3] ?? "/replace-color";
const DOCUMENT = resolve(
  import.meta.dirname,
  "../../../src/core/tests/test-fixtures/user-sample.pdf",
);

const VISIBLE = /(.*)/;
void VISIBLE;

async function waitVisible(page: Page, selector: string, timeout = 6_000): Promise<boolean> {
  return page
    .waitForFunction(
      (sel) => Array.from(document.querySelectorAll(sel)).some((el) => el.getClientRects().length > 0),
      selector,
      { timeout },
    )
    .then(() => true)
    .catch(() => false);
}

async function describe(page: Page, label: string, selector: string): Promise<void> {
  const found = await page.evaluate(
    (sel) =>
      Array.from(document.querySelectorAll(sel))
        .filter((el) => el.getClientRects().length > 0)
        .slice(0, 12)
        .map((el) => ({
          cls: String(el.className).split(/\s+/).slice(0, 2).join("."),
          inPortal: !el.closest(".tool-panel"),
        })),
    selector,
  );
  console.log(label, found);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await fulfillUnstubbedApis(context);
const page = await context.newPage();
await seedCookieConsent(page);
await bypassOnboarding(page);
await mockAppApis(page, {});
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));

await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "load" });
await page.waitForFunction(() => document.querySelector(".tool-panel") !== null, null, { timeout: 20_000 });
console.log("url:", page.url());

await page.getByTestId("file-input").setInputFiles(DOCUMENT);
const settingsVisible = await waitVisible(page, ".tool-panel input.mantine-Select-input", 60_000);
console.log("settings select visible:", settingsVisible);

const select = page.locator(".tool-panel input.mantine-Select-input").first();
await select.click();
console.log("options visible:", await waitVisible(page, '[role="option"]'));
await page
  .locator('[role="option"]')
  .filter({ hasText: /custom/i })
  .first()
  .click();

console.log("color inputs visible:", await waitVisible(page, "input.mantine-ColorInput-input"));
console.log(
  "color input values:",
  await page.evaluate(() =>
    Array.from(document.querySelectorAll("input.mantine-ColorInput-input")).map((el) => (el as HTMLInputElement).value),
  ),
);

const colorInput = page.locator("input.mantine-ColorInput-input").first();
await colorInput.click();
await page
  .waitForFunction(
    () => Array.from(document.querySelectorAll('[class*="Saturation"]')).some((el) => el.getClientRects().length > 0),
    null,
    { timeout: 5_000 },
  )
  .catch(() => console.log("no visible saturation area after clicking the input"));
console.log(
  "visible popovers:",
  await page.evaluate(() =>
    Array.from(document.querySelectorAll(".mantine-Popover-dropdown"))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.outerHTML.slice(0, 220)),
  ),
);
await describe(page, "picker parts:", '[class*="Saturation"], [class*="HueSlider"], [class*="AlphaSlider"], [class*="ColorSwatch"]');
const pickerOpen = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[class*="Saturation"]')).some((el) => el.getClientRects().length > 0),
);
console.log("picker open after input click:", pickerOpen);

// Keyboard + validation on whichever element has focus.
await colorInput.click();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type("zzz");
await page
  .waitForFunction(() => document.querySelector("input.mantine-ColorInput-input") !== null, null, { timeout: 3_000 })
  .catch(() => undefined);
console.log(
  "after typing an invalid value:",
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>("input.mantine-ColorInput-input");
    return { value: el?.value, invalid: el?.getAttribute("aria-invalid") };
  }),
);
await page.keyboard.press("Escape");
console.log(
  "picker open after Escape:",
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="ColorPicker-root"]')).some((el) => el.getClientRects().length > 0),
  ),
);
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type("#3366cc");
console.log(
  "after typing a valid value:",
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>("input.mantine-ColorInput-input");
    return { value: el?.value, swatch: document.querySelector("input.mantine-ColorInput-input")?.parentElement?.parentElement?.querySelector("[style]")?.getAttribute("style")?.slice(0, 40) };
  }),
);
await browser.close();
