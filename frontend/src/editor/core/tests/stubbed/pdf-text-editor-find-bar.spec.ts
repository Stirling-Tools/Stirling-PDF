import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
import type { Page } from "@playwright/test";
import path from "path";
import { waitForEditorReady } from "@editor/tests/stubbed/editorReady";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

/** The viewer's bottom-bar button, which opens the editor's own find while it is open. */
const findButton = (page: Page) =>
  page.getByRole("button", { name: "Find & replace" });

async function openFind(page: Page): Promise<void> {
  await openInTextEditor(page, SAMPLE_PDF);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  // The first page's render holds the main thread, and a cold worker's
  // can outlast the click's wait for the button to stop moving.
  await waitForEditorReady(page, 60_000);
  await findButton(page).click();
  await expect(page.getByTestId("pdf-editor-find-bar")).toBeVisible();
}

test.describe("PDF text editor - find bar", () => {
  test("the bottom bar's find button opens AND closes the bar", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFind(page);
    const search = findButton(page);

    await search.click();
    await expect(
      page.getByTestId("pdf-editor-find-bar"),
      "re-clicking find must put the find bar away",
    ).toBeHidden();

    await search.click();
    await expect(page.getByTestId("pdf-editor-find-bar")).toBeVisible();
  });

  test("the bar floats over the pages instead of pushing them down", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openInTextEditor(page, SAMPLE_PDF);
    const firstPage = page.getByTestId("pdf-editor-page-0");
    await expect(firstPage).toBeVisible({ timeout: 60_000 });
    await waitForEditorReady(page, 60_000);
    const before = await firstPage.boundingBox();
    await findButton(page).click();
    await expect(page.getByTestId("pdf-editor-find-bar")).toBeVisible();
    const after = await firstPage.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
  });

  test("the bar sits above the bottom bar's find button", async ({ page }) => {
    test.setTimeout(120_000);
    await openFind(page);
    const button = await findButton(page).boundingBox();
    const bar = await page.getByTestId("pdf-editor-find-bar").boundingBox();
    expect(button).not.toBeNull();
    expect(bar).not.toBeNull();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(button!.y);
  });

  test("replace stays tucked away until asked for", async ({ page }) => {
    test.setTimeout(120_000);
    await openFind(page);
    const toggle = page.getByTestId("pdf-editor-find-toggle-replace");
    await expect(page.getByTestId("pdf-editor-replace-input")).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(page.getByTestId("pdf-editor-replace-input")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
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
    expect(count!.x).toBeGreaterThan(field!.x);
    expect(count!.x + count!.width).toBeLessThanOrEqual(
      field!.x + field!.width + 1,
    );
    expect(next!.x).toBeGreaterThan(field!.x + field!.width);
  });

  test("the replace row lines up with the find row", async ({ page }) => {
    test.setTimeout(120_000);
    await openFind(page);
    await page.getByTestId("pdf-editor-find-toggle-replace").click();
    const find = await page.getByTestId("pdf-editor-find-input").boundingBox();
    const replace = await page
      .getByTestId("pdf-editor-replace-input")
      .boundingBox();
    expect(find).not.toBeNull();
    expect(replace).not.toBeNull();
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
