import path from "node:path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";

const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");

/**
 * The (i) affordance is a disclosure, not a tooltip: hover previews, click
 * pins, and the pinned panel must be the same DOM node as the preview. The
 * same-node assertion is the regression guard for the old implementation,
 * which added a close button and changed content padding on click, visibly
 * reflowing the bubble.
 */
test.describe("InfoTooltip", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.locator("button.sui-info:visible").first()).toBeVisible();
  });

  test("hover previews and click pins the same panel without remounting", async ({
    page,
  }) => {
    const trigger = page.locator("button.sui-info:visible").first();
    await trigger.hover();

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    const preview = await panel.elementHandle();
    expect(preview).not.toBeNull();

    await trigger.click();
    await expect(panel).toBeVisible();

    const stillAttached = await preview!.evaluate(
      (node) =>
        node.isConnected &&
        node === document.querySelector('[role="dialog"]') &&
        node.getAttribute("data-pinned") === "true",
    );
    expect(stillAttached).toBe(true);

    // A second click unpins and closes.
    await trigger.click();
    await expect(panel).toBeHidden();
  });

  test("keyboard opens, Escape closes and focus returns to the trigger", async ({
    page,
  }) => {
    const trigger = page.locator("button.sui-info:visible").first();
    await trigger.focus();
    await trigger.press("Enter");

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("outside click closes a pinned panel", async ({ page }) => {
    const trigger = page.locator("button.sui-info:visible").first();
    await trigger.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    await page.mouse.click(5, 5);
    await expect(panel).toBeHidden();
  });

  test("long guides scroll inside the panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 650 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await uploadFiles(page, SAMPLE);
    await page.goto("/compress", { waitUntil: "domcontentloaded" });
    await page.locator("button.sui-info").first().click();

    const body = page.locator(".sui-info-panel__body");
    await expect(body).toBeVisible();
    const dimensions = await body.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }));
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

    await body.hover();
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => body.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(0);
  });
});
