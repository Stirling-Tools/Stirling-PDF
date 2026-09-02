import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

/**
 * The find bar's layout, the way a code editor builds one.
 *
 * Two rows fenced off from the page by their own rules, the match count and
 * the option toggles inside the search field, and navigation beside it. The
 * toggles being inside the field is the part that needs a test: Mantine makes
 * an input's section inert by default so clicks fall through to the input, so
 * a real button placed there silently stops responding.
 */

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

async function openFind(page: Page): Promise<void> {
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
  await page.getByTestId("pdf-editor-open-find").click();
  await expect(page.getByTestId("pdf-editor-find-bar")).toBeVisible();
}

test.describe("PDF text editor - find bar", () => {
  test("the toolbar's search button opens AND closes the bar", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFind(page);
    const search = page.getByTestId("pdf-editor-open-find");
    // It is a toggle, and says so while the bar is up.
    await expect(search).toHaveAttribute("aria-pressed", "true");

    await search.click();
    await expect(
      page.getByTestId("pdf-editor-find-bar"),
      "re-clicking search must put the find bar away",
    ).toBeHidden();
    await expect(search).toHaveAttribute("aria-pressed", "false");

    await search.click();
    await expect(page.getByTestId("pdf-editor-find-bar")).toBeVisible();
  });

  test("the close button sits at the bar's far right, clear of the arrows", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFind(page);
    const close = await page.getByTestId("pdf-editor-find-close").boundingBox();
    const next = await page.getByTestId("pdf-editor-find-next").boundingBox();
    const bar = await page.getByTestId("pdf-editor-find-bar").boundingBox();
    expect(close).not.toBeNull();
    expect(next).not.toBeNull();
    expect(bar).not.toBeNull();
    // Well clear of the match arrows, and hard against the bar's own edge.
    expect(close!.x).toBeGreaterThan(next!.x + next!.width + 40);
    expect(bar!.x + bar!.width - (close!.x + close!.width)).toBeLessThan(24);
  });

  test("the option toggles inside the field actually toggle", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFind(page);

    for (const id of [
      "pdf-editor-find-match-case",
      "pdf-editor-find-whole-word",
      "pdf-editor-find-ignore-accents",
    ]) {
      const toggle = page.getByTestId(id);
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await toggle.click();
      await expect(
        toggle,
        `${id} did not respond to a click - is the input section inert?`,
      ).toHaveAttribute("aria-pressed", "true");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
    }
  });

  test("match case narrows the results it reports", async ({ page }) => {
    test.setTimeout(120_000);
    await openFind(page);
    await page.getByTestId("pdf-editor-find-input").fill("AS");

    const count = page.getByTestId("pdf-editor-find-count");
    // The fixture's cells are lowercase "as", so a case-blind search finds them.
    await expect(count).toContainText(/of/);
    await page.getByTestId("pdf-editor-find-match-case").click();
    await expect(count).toContainText(/no matches/i);
  });

  test("the count sits inside the field and navigation beside it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFind(page);
    await page.getByTestId("pdf-editor-find-input").fill("as");
    await expect(page.getByTestId("pdf-editor-find-count")).toContainText(/of/);

    const field = await page.getByTestId("pdf-editor-find-input").boundingBox();
    const count = await page.getByTestId("pdf-editor-find-count").boundingBox();
    const next = await page.getByTestId("pdf-editor-find-next").boundingBox();
    expect(field).not.toBeNull();
    expect(count).not.toBeNull();
    expect(next).not.toBeNull();
    // Count within the field's box; navigation entirely to its right.
    expect(count!.x).toBeGreaterThan(field!.x);
    expect(count!.x + count!.width).toBeLessThanOrEqual(
      field!.x + field!.width + 1,
    );
    expect(next!.x).toBeGreaterThan(field!.x + field!.width);
  });

  test("the replace row lines up with the find row", async ({ page }) => {
    test.setTimeout(120_000);
    await openFind(page);
    const find = await page.getByTestId("pdf-editor-find-input").boundingBox();
    const replace = await page
      .getByTestId("pdf-editor-replace-input")
      .boundingBox();
    expect(find).not.toBeNull();
    expect(replace).not.toBeNull();
    // Both fields end at the same x, so the two rows do not step.
    expect(
      Math.abs(find!.x + find!.width - (replace!.x + replace!.width)),
    ).toBeLessThanOrEqual(2);
  });

  test("Escape in the find field closes the bar", async ({ page }) => {
    test.setTimeout(120_000);
    await openFind(page);
    await page.getByTestId("pdf-editor-find-input").press("Escape");
    await expect(page.getByTestId("pdf-editor-find-bar")).toBeHidden();
  });
});
