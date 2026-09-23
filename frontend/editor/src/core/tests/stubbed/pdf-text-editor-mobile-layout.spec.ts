import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});

async function openEditor(page: Page, fileName?: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("stirling.mobileSwipeHintSeen", "true");
  });
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeAttached({
    timeout: 30_000,
  });
  await page.locator('[data-testid="pdf-editor-file-input"]').setInputFiles(
    fileName
      ? {
          name: fileName,
          mimeType: "application/pdf",
          buffer: fs.readFileSync(SAMPLE_PDF),
        }
      : SAMPLE_PDF,
  );
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("PDF text editor - phone layout", () => {
  test("opens on the canvas, fitted to width, with one header", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    await expect(page.getByRole("tab", { name: "Workspace" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("pdf-editor-toolbar")).toHaveAttribute(
      "data-layout",
      "mobile",
    );
    await expect(page.getByTestId("pdf-editor-mobile-save")).toBeVisible();

    // Read both boxes per poll: the phone slider is still scrolling into view.
    await expect
      .poll(async () => {
        const stage = await page.getByTestId("pdf-editor-stage").boundingBox();
        const box = await page.getByTestId("pdf-editor-page-0").boundingBox();
        return (
          !!box &&
          !!stage &&
          box.x >= stage.x &&
          box.x + box.width <= stage.x + stage.width
        );
      })
      .toBe(true);
  });

  test("rotating the phone refits the page to the new width", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    const pageWidth = async () =>
      (await page.getByTestId("pdf-editor-page-0").boundingBox())?.width ?? 0;
    await expect.poll(pageWidth).toBeGreaterThan(300);
    const portrait = await pageWidth();

    await page.setViewportSize({ width: 740, height: 390 });
    await expect
      .poll(async () => {
        const stage = await page.getByTestId("pdf-editor-stage").boundingBox();
        const width = await pageWidth();
        return !!stage && width > portrait + 200 && width <= stage.width;
      })
      .toBe(true);
  });

  test("a long file name truncates instead of pushing Save off screen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(
      page,
      `${"quarterly-report-final-revision-".repeat(4)}.pdf`,
    );

    const toolbar = page.getByTestId("pdf-editor-toolbar");
    await expect
      .poll(() =>
        toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      )
      .toBe(true);
    const bar = await toolbar.boundingBox();
    const save = await page.getByTestId("pdf-editor-mobile-save").boundingBox();
    expect(bar && save && save.x + save.width <= bar.x + bar.width + 1).toBe(
      true,
    );
  });

  test("the action bar follows the selection and opens the sheets", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    const bar = page.getByTestId("pdf-editor-mobile-actionbar");
    await expect(bar).toHaveAttribute("data-context", "idle");

    await page.locator('[data-testid^="pdf-editor-run-"]').first().tap();
    await expect(bar).toHaveAttribute("data-context", "selection");

    await page.getByTestId("pdf-editor-mobile-style").tap();
    await expect(page.getByTestId("pdf-editor-font-size")).toBeVisible();
    await page.locator(".mantine-Drawer-close:visible").first().click();

    await page.getByTestId("pdf-editor-mobile-details").tap();
    await expect(
      page.getByTestId("pdf-editor-selection-inspector"),
    ).toBeVisible();
    await page.locator(".mantine-Drawer-close:visible").first().click();

    await page.getByTestId("pdf-editor-mobile-done").tap();
    await expect(bar).toHaveAttribute("data-context", "idle");
  });

  test("every action bar control is at least 44px tall", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    const buttons = page
      .getByTestId("pdf-editor-mobile-actionbar")
      .locator("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
