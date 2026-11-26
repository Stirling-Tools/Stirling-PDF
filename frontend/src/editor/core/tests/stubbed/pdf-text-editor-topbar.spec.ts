import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
import type { Page } from "@playwright/test";
import path from "path";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

async function openEditor(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openInTextEditor(page, SAMPLE_PDF);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("PDF text editor - desktop layout", () => {
  test("the panel carries insert, history and save; no strip over the pages", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    // Formatting floats beside the selection, so the pages have nothing above them.
    expect(await page.getByTestId("pdf-editor-toolbar").count()).toBe(0);
    const tools = page.getByTestId("pdf-editor-panel-tools");
    for (const id of [
      "pdf-editor-add-text",
      "pdf-editor-add-table",
      "pdf-editor-add-image",
    ]) {
      await expect(
        tools.locator(`[data-testid="${id}"]`),
        `${id} must lead the panel`,
      ).toBeVisible();
    }
    const footer = page.getByTestId("pdf-editor-panel-actions");
    for (const id of ["pdf-editor-undo", "pdf-editor-redo"]) {
      await expect(
        footer.locator(`[data-testid="${id}"]`),
        `${id} must sit in the panel footer`,
      ).toBeVisible();
    }
    await expect(page.getByTestId("pdf-editor-help")).toBeVisible();
  });

  test("marks the document unsaved once edited", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    expect(await page.getByTestId("pdf-editor-dirty-dot").count()).toBe(0);

    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid^="pdf-editor-run-"]',
      );
      if (!el) throw new Error("no run overlay in the DOM");
      el.focus();
      const selection = window.getSelection();
      if (!selection) throw new Error("no Selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, "X");
    });

    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("each control is stated exactly once", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    for (const id of [
      "pdf-editor-add-text",
      "pdf-editor-help",
      "pdf-editor-save",
    ]) {
      expect(
        await page.locator(`[data-testid="${id}"]`).count(),
        `${id} must exist exactly once`,
      ).toBe(1);
    }
  });

  test("Save sits in the panel footer, like every other tool", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    const footer = page.getByTestId("pdf-editor-panel-actions");
    await expect(footer).toBeVisible();
    await expect(
      footer.locator('[data-testid="pdf-editor-save"]'),
    ).toBeVisible();
    await expect(
      footer.locator('[data-testid="pdf-editor-download"]'),
    ).toBeVisible();
  });

  test("a phone-width layout also gets find and help in the panel", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 480, height: 900 });
    await openEditor(page);

    await expect(page.getByTestId("pdf-editor-panel-actions")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("pdf-editor-save")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-open-find-panel")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-help-panel")).toBeVisible();
  });

  test("Find opens from the viewer's bottom bar and sits just above it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    await page.getByRole("button", { name: "Find & replace" }).click();
    const findBar = page.getByTestId("pdf-editor-find-bar");
    await expect(findBar).toBeVisible();
    const bar = await findBar.boundingBox();
    const pages = await page.locator("[data-viewer-pages]").boundingBox();
    const dock = await page
      .locator(".pdf-viewer-toolbar-dock > div")
      .first()
      .boundingBox();
    expect(bar).not.toBeNull();
    expect(pages).not.toBeNull();
    expect(dock).not.toBeNull();
    // Over the pages column, clear of the side panel, and clear of the bar below.
    expect(bar!.x).toBeGreaterThanOrEqual(pages!.x);
    expect(bar!.x + bar!.width).toBeLessThanOrEqual(pages!.x + pages!.width);
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(dock!.y);
    expect(dock!.y - (bar!.y + bar!.height)).toBeLessThan(24);
  });
});
