import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
import type { Locator, Page } from "@playwright/test";
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
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add Files" }).first().click();
  await (
    await chooser
  ).setFiles(
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

/**
 * Whether page 0 is fitted to the viewer's width: centred, with nothing but the
 * viewer's own gutter either side.
 */
async function fillsWidth(page: Page): Promise<boolean> {
  const pages = await page.locator("[data-viewer-pages]").boundingBox();
  const box = await page.getByTestId("pdf-editor-page-0").boundingBox();
  if (!pages || !box) return false;
  const left = box.x - pages.x;
  const right = pages.x + pages.width - (box.x + box.width);
  const gutter = 4 * 16;
  return (
    left >= 0 && right >= 0 && Math.abs(left - right) <= 2 && left <= gutter
  );
}

// Close the open sheet once it has finished sliding in, then wait for it to go.
async function closeSheet(page: Page, content: Locator): Promise<void> {
  const sheet = page
    .locator(".mantine-Drawer-content")
    .filter({ has: content });
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await sheet.locator(".mantine-Drawer-close").click();
  // A sheet still sliding out swallows taps meant for the action bar.
  await expect(content).toBeHidden();
}

test.describe("PDF text editor - phone layout", () => {
  test("edits in the viewer, fitted to width, with the phone controls", async ({
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
    // The editing actions stand in for the viewer's page bar and tool row.
    await expect(page.getByTestId("pdf-editor-mobile-actionbar")).toBeVisible();
    await expect(page.locator(".pdf-viewer-toolbar-dock")).toHaveCount(0);
    await expect(page.locator(".workbench-bar-center")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /notifications/i }),
    ).toHaveCount(1);
    await expect.poll(() => fillsWidth(page)).toBe(true);
  });

  test("rotating the phone refits the page to the new width", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    const pageWidth = async () =>
      (await page.getByTestId("pdf-editor-page-0").boundingBox())?.width ?? 0;
    await expect.poll(() => fillsWidth(page)).toBe(true);
    const portrait = await pageWidth();

    await page.setViewportSize({ width: 740, height: 390 });
    await expect
      .poll(
        async () =>
          (await fillsWidth(page)) && (await pageWidth()) > portrait + 200,
      )
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
    // Squeezed rather than pushed off, Save would clip its own label.
    expect(
      await page
        .getByTestId("pdf-editor-mobile-save")
        .evaluate((el) =>
          Array.from(el.querySelectorAll<HTMLElement>("*")).every(
            (child) => child.scrollWidth <= child.clientWidth + 1,
          ),
        ),
    ).toBe(true);
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
    await closeSheet(page, page.getByTestId("pdf-editor-font-size"));

    await page.getByTestId("pdf-editor-mobile-details").tap();
    await expect(
      page.getByTestId("pdf-editor-selection-inspector"),
    ).toBeVisible();
    await closeSheet(page, page.getByTestId("pdf-editor-selection-inspector"));

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

  test("the action bar zooms the viewer", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await expect.poll(() => fillsWidth(page)).toBe(true);
    const width = async () =>
      (await page.getByTestId("pdf-editor-page-0").boundingBox())?.width ?? 0;
    const fitted = await width();

    await page.getByTestId("pdf-editor-mobile-zoom").tap();
    await page.getByRole("menuitem", { name: "Zoom in" }).tap();
    await expect.poll(width).toBeGreaterThan(fitted * 1.05);

    await page.getByRole("menuitem", { name: "Fit to width" }).tap();
    await expect.poll(width).toBeLessThan(fitted * 1.02);
  });

  test("leaving with unsaved edits asks once, and discarding leaves", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid^="pdf-editor-run-"]',
      );
      if (!el) throw new Error("no run overlay in the DOM");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      document.execCommand("insertText", false, "PHONE");
    });
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();

    await page.getByRole("tab", { name: "Tools" }).tap();
    await page.getByRole("button", { name: "Back to all tools" }).tap();
    await expect(page.getByTestId("unsaved-discard")).toBeVisible();
    await page.getByTestId("unsaved-discard").tap();

    await expect(page).toHaveURL(/\/editor$|\/$/);
    await expect(page.getByTestId("unsaved-discard")).toHaveCount(0);
    await expect(page.getByTestId("pdf-editor-discard-modal")).toHaveCount(0);
  });

  test("closing the editor gives the viewer its own controls back", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await expect(page.locator(".pdf-viewer-toolbar-dock")).toHaveCount(0);

    await page.getByRole("tab", { name: "Tools" }).tap();
    await page.getByRole("button", { name: "Back to all tools" }).tap();
    await page.getByRole("tab", { name: "Workspace" }).tap();

    await expect(page.getByTestId("pdf-editor-mobile-actionbar")).toHaveCount(
      0,
    );
    await expect(page.locator(".pdf-viewer-toolbar-dock")).toBeVisible();
    await expect(page.locator(".workbench-bar-center")).toBeVisible();
  });
});

test.describe("PDF text editor - phone entry", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("opening the editor on a file already in the viewer fits it to width", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem("stirling.mobileSwipeHintSeen", "true");
    });
    await page.goto("/compress", { waitUntil: "domcontentloaded" });
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add Files" }).first().click();
    await (await chooser).setFiles(SAMPLE_PDF);
    await page.getByRole("tab", { name: "Workspace" }).tap();
    const viewerPage = page.locator('[data-page-index="0"]').first();
    await expect(viewerPage).toBeVisible({ timeout: 60_000 });
    const viewed = (await viewerPage.boundingBox())?.width ?? 0;

    await page.getByTestId("viewer-edit-text").first().tap();
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 60_000,
    });
    await expect.poll(() => fillsWidth(page)).toBe(true);
    expect(
      (await page.getByTestId("pdf-editor-page-0").boundingBox())?.width,
    ).toBeGreaterThanOrEqual(viewed - 1);
  });
});

test.describe("PDF text editor - tablet layout", () => {
  test.use({ viewport: { width: 900, height: 1200 } });

  test("edits in the viewer with the touch controls", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await expect(page.getByTestId("pdf-editor-toolbar")).toHaveAttribute(
      "data-layout",
      "mobile",
    );
    await expect(page.getByTestId("pdf-editor-mobile-actionbar")).toBeVisible();
    await expect(page.locator("[data-viewer-pages]")).toBeVisible();
  });
});

test.describe("PDF text editor - resizing", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("crossing the touch layout keeps the open document and its edits", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem("stirling.mobileSwipeHintSeen", "true");
    });
    await page.goto("/pdf-text-editor");
    await openInTextEditor(page, SAMPLE_PDF);
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 60_000,
    });
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid^="pdf-editor-run-p0-"]',
      );
      if (!el) throw new Error("no run overlay in the DOM");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      document.execCommand("insertText", false, "KEPT");
    });
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();

    for (const width of [900, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible();
      await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();
      // The panel remounts in the other layout; it must not take its own
      // file for a new one and offer to discard the edits.
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.locator('[data-testid^="pdf-editor-run-p0-"]').first(),
      ).toContainText("KEPT");
    }
  });
});
