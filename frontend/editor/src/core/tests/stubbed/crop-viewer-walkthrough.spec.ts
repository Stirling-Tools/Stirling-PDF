import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import type { Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/** Capture-only walkthrough for the viewer-surface crop experiment. */

test.skip(!!process.env.CI, "capture-only spec; not for CI");

const SHOT_DIR =
  process.env.SHOT_DIR ??
  path.join(import.meta.dirname, "../../../../screenshots/crop-ui");
const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES, "sample.pdf");
const MULTI_PAGE_PDF = path.join(FIXTURES, "multi-page-sample.pdf");
const ROTATED_PDF = path.join(FIXTURES, "cropbox-rotate90.pdf");

function shot(name: string): string {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, `${name}.png`);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function enableDark(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

async function openCrop(page: Page, width = 1440, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/crop", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
    timeout: 20_000,
  });
}

async function upload(page: Page, file = SAMPLE_PDF): Promise<void> {
  await uploadFiles(page, file);
  await expect(page.getByTestId("crop-viewer-overlay")).toBeVisible({
    timeout: 20_000,
  });
  await settle(page);
}

async function drawSelection(
  page: Page,
  from = { x: 0.18, y: 0.22 },
  to = { x: 0.78, y: 0.7 },
): Promise<void> {
  const overlay = page.getByTestId("crop-viewer-overlay");
  const box = await overlay.boundingBox();
  if (!box) throw new Error("crop overlay has no box");
  await page.mouse.move(
    box.x + box.width * from.x,
    box.y + box.height * from.y,
  );
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to.x, box.y + box.height * to.y, {
    steps: 12,
  });
  await page.mouse.up();
  await settle(page);
}

test.describe("crop on the viewer", () => {
  test("30_viewer_default_light", async ({ page }) => {
    await openCrop(page);
    await upload(page);
    await page.screenshot({ path: shot("30_viewer_default_light") });
  });

  test("31_viewer_selection_light", async ({ page }) => {
    await openCrop(page);
    await upload(page);
    await drawSelection(page);
    await page.screenshot({ path: shot("31_viewer_selection_light") });
  });

  test("32_viewer_multi_page_light", async ({ page }) => {
    await openCrop(page);
    await upload(page, MULTI_PAGE_PDF);
    await page
      .getByTestId("viewer-root")
      .getByRole("button", { name: "Next Page" })
      .click();
    await expect(page.getByTestId("crop-viewer-overlay")).toHaveAttribute(
      "data-page-number",
      "2",
      { timeout: 10_000 },
    );
    await drawSelection(page, { x: 0.12, y: 0.18 }, { x: 0.72, y: 0.62 });
    await page.screenshot({ path: shot("32_viewer_multi_page_light") });
  });

  test("33_viewer_rotated_light", async ({ page }) => {
    await openCrop(page);
    await upload(page, ROTATED_PDF);
    await drawSelection(page, { x: 0.25, y: 0.3 }, { x: 0.75, y: 0.7 });
    await page.screenshot({ path: shot("33_viewer_rotated_light") });
  });

  test("34_viewer_selection_dark", async ({ page }) => {
    await enableDark(page);
    await openCrop(page);
    await upload(page);
    await drawSelection(page);
    await page.screenshot({ path: shot("34_viewer_selection_dark") });
  });

  test("35_viewer_narrow_light", async ({ page }) => {
    await openCrop(page, 1100, 800);
    await upload(page);
    await drawSelection(page);
    await page.screenshot({ path: shot("35_viewer_narrow_light") });
  });

  test("36_viewer_default_dark", async ({ page }) => {
    await enableDark(page);
    await openCrop(page);
    await upload(page);
    await page.screenshot({ path: shot("36_viewer_default_dark") });
  });

  test("37_viewer_mobile", async ({ page }) => {
    await openCrop(page);
    await upload(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => window.innerWidth === 390);
    const cropOnPage = page.getByRole("button", { name: "Crop on page" });
    await expect(cropOnPage).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: shot("37_viewer_mobile_panel_light") });

    await cropOnPage.click();
    const overlay = page.getByTestId("crop-viewer-overlay");
    await expect(page.getByRole("tab", { name: "Workspace" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    const box = await overlay.boundingBox();
    if (!box) throw new Error("crop overlay has no box");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.24);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, {
      steps: 10,
    });
    await page.mouse.up();
    await settle(page);
    await page.screenshot({ path: shot("37_viewer_mobile_light") });

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("crop-viewer-hint")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("38_viewer_mobile_dark", async ({ page }) => {
    await enableDark(page);
    await openCrop(page);
    await upload(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => window.innerWidth === 390);
    const cropOnPage = page.getByRole("button", { name: "Crop on page" });
    await expect(cropOnPage).toBeVisible({ timeout: 20_000 });
    await cropOnPage.click();
    const overlay = page.getByTestId("crop-viewer-overlay");
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    const box = await overlay.boundingBox();
    if (!box) throw new Error("crop overlay has no box");
    await page.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.72, {
      steps: 10,
    });
    await page.mouse.up();
    await settle(page);
    await page.screenshot({ path: shot("38_viewer_mobile_dark") });
  });
});
