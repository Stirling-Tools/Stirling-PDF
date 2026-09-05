import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// The page verbs live in the canvas top bar; Save lives in the panel footer
// like every other tool's primary action.

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

async function openEditor(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SAMPLE_PDF);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("PDF text editor - top bar", () => {
  test("carries the document actions that used to live in the panel", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    const toolbar = page.getByTestId("pdf-editor-toolbar");
    await expect(toolbar).toBeVisible();
    for (const id of [
      "pdf-editor-undo",
      "pdf-editor-redo",
      "pdf-editor-add-text",
      "pdf-editor-add-image",
      "pdf-editor-open-find",
      "pdf-editor-help",
    ]) {
      await expect(
        toolbar.locator(`[data-testid="${id}"]`),
        `${id} must be in the top bar`,
      ).toBeVisible();
    }
  });

  test("names the open document, and marks it unsaved once edited", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    await expect(page.getByTestId("pdf-editor-filename")).toContainText(
      "sample.pdf",
    );
    expect(await page.getByTestId("pdf-editor-dirty-dot").count()).toBe(0);

    // A real keystroke through the contenteditable overlay, not a store poke.
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

    // The page verbs live in the toolbar, Save lives in the panel footer, and
    // neither is repeated in the other.
    for (const id of [
      "pdf-editor-add-text",
      "pdf-editor-open-find",
      "pdf-editor-help",
      "pdf-editor-save",
      "pdf-editor-filename",
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
    // ...and nowhere else. A primary action in two places is a primary action
    // the user has to choose between.
    expect(
      await page
        .getByTestId("pdf-editor-toolbar")
        .locator('[data-testid="pdf-editor-save"]')
        .count(),
    ).toBe(0);
  });

  test("a phone-width layout also gets find and help in the panel", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 480, height: 900 });
    await openEditor(page);

    // Here the panel covers the canvas outright, so the toolbar's own find and
    // shortcuts buttons are not merely elsewhere - they are off screen.
    await expect(page.getByTestId("pdf-editor-panel-actions")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("pdf-editor-save")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-open-find-panel")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-help-panel")).toBeVisible();
  });

  test("a narrow bar folds insert, find and help into one menu", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Wide enough that the canvas still shows, narrow enough that the toolbar
    // cannot hold the contextual formatting group AND four standalone buttons.
    await page.setViewportSize({ width: 1150, height: 900 });
    await openEditor(page);

    const bar = page.getByTestId("pdf-editor-toolbar");
    await expect(bar).toHaveAttribute("data-compact", "true");
    // The individual buttons are gone; nothing is merely scrolled off-screen.
    expect(await page.getByTestId("pdf-editor-add-text").count()).toBe(0);
    expect(await page.getByTestId("pdf-editor-open-find").count()).toBe(0);

    // Undo/redo never folds away, and Save is not on the bar to fold.
    await expect(bar.locator('[data-testid="pdf-editor-undo"]')).toBeVisible();
    await expect(page.getByTestId("pdf-editor-panel-actions")).toBeVisible();

    await page.getByTestId("pdf-editor-overflow-menu").click();
    for (const id of [
      "pdf-editor-add-text",
      "pdf-editor-add-image",
      "pdf-editor-open-find",
      "pdf-editor-help",
    ]) {
      await expect(
        page.getByTestId(id),
        `${id} must be reachable from the overflow menu`,
      ).toBeVisible();
    }
  });

  test("a wide bar keeps every control on show", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await expect(page.getByTestId("pdf-editor-toolbar")).toHaveAttribute(
      "data-compact",
      "false",
    );
    expect(await page.getByTestId("pdf-editor-overflow-menu").count()).toBe(0);
  });

  test("Find opens beside the pages, not in the panel", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    await page.getByTestId("pdf-editor-open-find").click();
    const findBar = page.getByTestId("pdf-editor-find-bar");
    await expect(findBar).toBeVisible();
    // Docked under the toolbar, above the page stack.
    const bar = await findBar.boundingBox();
    const stage = await page.getByTestId("pdf-editor-stage").boundingBox();
    expect(bar).not.toBeNull();
    expect(stage).not.toBeNull();
    expect(bar!.y).toBeLessThan(stage!.y);
  });
});
