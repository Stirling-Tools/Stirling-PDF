import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import type { Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/** Capture-only walkthrough for the crop tool. Never runs in CI. */

test.skip(!!process.env.CI, "capture-only spec; not for CI");

const SHOT_DIR =
  process.env.SHOT_DIR ??
  path.join(import.meta.dirname, "../../../../screenshots/crop-ui");

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES, "sample.pdf");
const MULTI_PAGE_PDF = path.join(FIXTURES, "multi-page-sample.pdf");
const ROTATED_PDF = path.join(FIXTURES, "cropbox-rotate90.pdf");

type Theme = "light" | "dark";

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

async function applyTheme(page: Page, theme: Theme): Promise<void> {
  if (theme !== "dark") return;
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

async function enableRtl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "ar-AR");
    localStorage.setItem("i18nextLng-source", "3");
    const applyDir = () => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar-AR");
    };
    if (document.documentElement) applyDir();
    else document.addEventListener("DOMContentLoaded", applyDir);
  });
}

const panel = (page: Page) => page.locator('[data-sidebar="tool-panel"]');
const canvas = (page: Page) => page.getByTestId("crop-canvas");
const selection = (page: Page) => page.getByTestId("crop-selection");

async function openCrop(page: Page): Promise<void> {
  await page.goto("/crop", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-tour="run-button"]')).toBeVisible({
    timeout: 20_000,
  });
}

async function waitForPreview(page: Page): Promise<void> {
  const image = canvas(page).locator("img");
  await expect(image).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
  await image.evaluate(
    (element) =>
      (element as HTMLImageElement)
        .decode()
        .catch(() => undefined) as unknown as void,
  );
  await expect
    .poll(
      async () => {
        const box = await selection(page).boundingBox();
        return box?.width ?? 0;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(40);
  await settle(page);
}

async function upload(page: Page, file: string = SAMPLE_PDF): Promise<void> {
  await uploadFiles(page, file);
  await waitForPreview(page);
}

/** The mobile shell hides the sidebar upload button; the tool's own input is still there. */
async function uploadOnMobile(
  page: Page,
  file: string = SAMPLE_PDF,
): Promise<void> {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Upload", { exact: true }).first().click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await expect(page.getByText("sample.pdf").first()).toBeVisible({
    timeout: 15_000,
  });
  // Uploading drops the mobile shell into the viewer; reopen the tool URL.
  await page.goto("/crop", { waitUntil: "domcontentloaded" });
  await waitForPreview(page);
}

async function dragSelectionHandle(
  page: Page,
  handle: string,
  deltaX: number,
  deltaY: number,
  scope: ReturnType<Page["locator"]> | Page = page,
): Promise<void> {
  const target = scope.locator(`[data-handle="${handle}"]`).first();
  const box = await target.boundingBox();
  if (!box) throw new Error(`handle ${handle} has no box`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
  await settle(page);
}

async function capturePanel(page: Page, name: string): Promise<void> {
  await settle(page);
  await panel(page).screenshot({ path: shot(name) });
}

test.describe("crop ui walkthrough", () => {
  test.use({
    viewport: { width: 1440, height: 1280 },
    deviceScaleFactor: 2,
    autoGoto: false,
  });

  for (const theme of ["light", "dark"] as const) {
    test.describe(theme, () => {
      test(`01_empty_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await capturePanel(page, `01_empty_${theme}`);
      });

      test(`02_default_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page);
        await capturePanel(page, `02_default_${theme}`);
      });

      test(`03_inset_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page);
        await dragSelectionHandle(page, "se", -70, -90);
        await expect(page.getByTestId("crop-margin-right")).not.toHaveValue(
          "0",
        );
        await capturePanel(page, `03_inset_${theme}`);
      });

      test(`04_ratio_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page);
        await dragSelectionHandle(page, "se", -80, -60);
        await page.getByTestId("crop-ratio-a4").click();
        await settle(page);
        await capturePanel(page, `04_ratio_${theme}`);
      });

      test(`05_advanced_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page);
        await dragSelectionHandle(page, "nw", 50, 60);
        await page.getByText(/Exact coordinates/i).click();
        await page.waitForFunction(() => {
          const body = document.querySelector<HTMLElement>(
            '.sui-collapsible__body[data-open="true"]',
          );
          if (!body) return false;
          const height = body.getBoundingClientRect().height;
          const state = window as unknown as { __collapseHeight?: number };
          const settled = state.__collapseHeight === height && height > 80;
          state.__collapseHeight = height;
          return settled;
        });
        await page.getByLabel(/Height/i).scrollIntoViewIfNeeded();
        await capturePanel(page, `05_advanced_${theme}`);
      });

      test(`06_auto_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page);
        await page.getByText(/Auto-trim/i).click();
        await expect(page.getByText(/White edges are detected/i)).toBeVisible();
        await capturePanel(page, `06_auto_${theme}`);
      });

      test(`07_editor_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page);
        await dragSelectionHandle(page, "se", -70, -90);
        await page.getByRole("button", { name: /Expand/i }).click();
        await expect(page.getByTestId("crop-editor")).toBeVisible();
        await settle(page);
        await page.screenshot({ path: shot(`07_editor_${theme}`) });
      });

      test(`08_editor_zoom_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page);
        await dragSelectionHandle(page, "se", -70, -90);
        await page.getByRole("button", { name: /Expand/i }).click();
        await expect(page.getByTestId("crop-editor")).toBeVisible();
        const editor = page.getByTestId("crop-editor");
        const zoomIn = editor.getByRole("button", { name: /Zoom in/i });
        await zoomIn.click();
        await zoomIn.click();
        await settle(page);
        await page.screenshot({ path: shot(`08_editor_zoom_${theme}`) });
      });

      test(`08b_loupe_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page);
        await dragSelectionHandle(page, "se", -90, -120);
        await page.getByRole("button", { name: /Expand/i }).click();
        await expect(page.getByTestId("crop-editor")).toBeVisible();
        const editor = page.getByTestId("crop-editor");
        const handle = editor
          .getByTestId("crop-canvas")
          .locator('[data-handle="n"]')
          .first();
        const box = await handle.boundingBox();
        if (!box) throw new Error("crop handle not found");
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x, box.y + 38, { steps: 10 });
        await settle(page);
        await page.screenshot({ path: shot(`08b_loupe_${theme}`) });
        await page.mouse.up();
      });

      test(`09b_multipage_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page, MULTI_PAGE_PDF);
        await expect(panel(page).getByText("1 / 3").first()).toBeVisible();
        await panel(page)
          .getByRole("button", { name: /Next page/i })
          .first()
          .click();
        await expect(panel(page).getByText("2 / 3").first()).toBeVisible();
        await page
          .getByText(/^This page$/i)
          .first()
          .click();
        await page.getByText("Crop area").first().scrollIntoViewIfNeeded();
        await settle(page);
        await capturePanel(page, `09b_multipage_${theme}`);
      });

      test(`09c_undo_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page);
        const size = page.getByTestId("crop-result-size");
        await expect(size).toContainText("216 × 279 mm");
        await dragSelectionHandle(page, "se", -70, -90);
        await expect(size).not.toContainText("216 × 279 mm");
        await page
          .getByRole("button", { name: /Undo crop change/i })
          .first()
          .click();
        await expect(size).toContainText("216 × 279 mm");
        await capturePanel(page, `09c_undo_${theme}`);
      });

      test(`09_rotated_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await openCrop(page);
        await upload(page, ROTATED_PDF);
        await dragSelectionHandle(page, "se", -50, -40);
        await capturePanel(page, `09_rotated_${theme}`);
      });
    });
  }

  test.describe("rtl", () => {
    for (const theme of ["light", "dark"] as const) {
      test(`10_rtl_default_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await enableRtl(page);
        await openCrop(page);
        await upload(page);
        await dragSelectionHandle(page, "se", -60, -70);
        await capturePanel(page, `10_rtl_default_${theme}`);
      });

      test(`11_rtl_editor_${theme}`, async ({ page }) => {
        await applyTheme(page, theme);
        await enableRtl(page);
        await openCrop(page);
        await upload(page);
        await page.getByRole("button", { name: /Expand/i }).click();
        await expect(page.getByTestId("crop-editor")).toBeVisible();
        await settle(page);
        await page.screenshot({ path: shot(`11_rtl_editor_${theme}`) });
      });
    }
  });
});

test.describe("crop ui walkthrough - mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    autoGoto: false,
  });

  for (const theme of ["light", "dark"] as const) {
    test(`20_mobile_inline_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await openCrop(page);
      await uploadOnMobile(page);
      await page.screenshot({ path: shot(`20_mobile_inline_${theme}`) });
    });

    test(`21_mobile_editor_${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await openCrop(page);
      await uploadOnMobile(page);
      await page.getByRole("button", { name: /Open crop editor/i }).click();
      await expect(page.getByTestId("crop-editor")).toBeVisible();
      await settle(page);
      await page.screenshot({ path: shot(`21_mobile_editor_${theme}`) });
    });
  }
});
