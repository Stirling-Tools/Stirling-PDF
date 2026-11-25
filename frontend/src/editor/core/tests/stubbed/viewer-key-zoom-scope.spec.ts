import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { toggleViewerPanel } from "@editor/tests/helpers/ui-helpers";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

/**
 * Ctrl +/- zoom the document only while the pages have the user's attention.
 * After a click on the viewer's bars the keys go to the browser, which
 * resizes the whole UI, so the viewer must leave them alone.
 */
test("ctrl + zooms the document after a click on the pages, and not after one on the bars", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator('[data-testid="file-input"]')
    .first()
    .setInputFiles(SAMPLE_PDF);
  await expect(page.getByText(/\/\s*1/).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const seen: boolean[] = [];
    (window as unknown as { zoomKeys: boolean[] }).zoomKeys = seen;
    window.addEventListener("keydown", (event) => {
      if (event.key === "=") seen.push(event.defaultPrevented);
    });
  });
  const keysSeen = () =>
    page.evaluate(
      () => (window as unknown as { zoomKeys: boolean[] }).zoomKeys.length,
    );
  const lastKeyTaken = () =>
    page.evaluate(() => {
      const seen = (window as unknown as { zoomKeys: boolean[] }).zoomKeys;
      return seen[seen.length - 1];
    });
  const zoom = page.getByTestId("viewer-zoom-input");

  await page
    .locator("[data-viewer-pages]")
    .first()
    .click({ position: { x: 40, y: 300 } });
  let before = await zoom.inputValue();
  await page.keyboard.press("Control+Equal");
  await expect(zoom).not.toHaveValue(before);
  expect(await lastKeyTaken()).toBe(true);

  await page.locator(".pdf-viewer-toolbar").click({ position: { x: 5, y: 5 } });
  before = await zoom.inputValue();
  const seenBefore = await keysSeen();
  await page.keyboard.press("Control+Equal");
  await expect.poll(keysSeen).toBe(seenBefore + 1);
  await expect(zoom).toHaveValue(before);
  expect(await lastKeyTaken()).toBe(false);

  // The comments panel sits inside the pages area but is a panel all the same.
  await toggleViewerPanel(page, "Comments");
  await page
    .locator(".comments-sidebar")
    .click({ position: { x: 20, y: 120 } });
  before = await zoom.inputValue();
  const seenBeforePanel = await keysSeen();
  await page.keyboard.press("Control+Equal");
  await expect.poll(keysSeen).toBe(seenBeforePanel + 1);
  await expect(zoom).toHaveValue(before);
  expect(await lastKeyTaken()).toBe(false);
});
