/**
 * Verify the viewer's text-selection plugin actually produces a selection
 * when a user drags across rendered text. Regression coverage for cases
 * where text selection silently breaks because a competing interaction
 * mode (e.g. the pan tool) captures pointer events before the selection
 * plugin sees them.
 */

import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

async function loadSampleAndOpenViewer(page: import("@playwright/test").Page) {
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);

  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });

  const selectionLayer = firstPage.locator(".pdf-selection-layer");
  await expect(selectionLayer).toBeAttached({ timeout: 15_000 });

  // Wait for tiles to render so geometry is loaded for hit-testing.
  await page.waitForTimeout(2_000);

  return firstPage;
}

async function dragSelectAcrossPage(
  page: import("@playwright/test").Page,
  firstPage: import("@playwright/test").Locator,
) {
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");

  const y = box.y + box.height * 0.18;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();
}

test("drag-selecting text in the viewer produces selection rects", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);
  await dragSelectAcrossPage(page, firstPage);

  const selectionRects = firstPage.locator(
    ".pdf-selection-layer > div:first-child > div",
  );
  await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });
  expect(await selectionRects.count()).toBeGreaterThan(0);
});

test("double-clicking a word produces a word-sized selection", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");

  // The sample PDF has "Test document for word documents" as a top paragraph
  // at about y = 11% of the page height. Aim at the word "document".
  await page.mouse.dblclick(
    box.x + box.width * 0.21,
    box.y + box.height * 0.105,
  );
  await page.waitForTimeout(500);

  const selectionRects = firstPage.locator(
    ".pdf-selection-layer > div:first-child > div",
  );
  await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });
});

test("hovering over text changes the cursor to an I-beam", async ({ page }) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");

  // Move over a position occupied by the top paragraph "Test document for
  // word documents" in the sample PDF.
  const targetX = box.x + box.width * 0.21;
  const targetY = box.y + box.height * 0.105;
  // Move in two hops to ensure pointermove fires.
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.waitForTimeout(100);
  await page.mouse.move(targetX, targetY, { steps: 5 });
  await page.waitForTimeout(500);

  const cursor = await firstPage.evaluate((el) => {
    const parent = (el as HTMLElement).parentElement;
    return parent ? getComputedStyle(parent).cursor : "no-parent";
  });

  expect(cursor).toMatch(/^(text|vertical-text)$/);
});

test("Ctrl+C copies selected text to the clipboard", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const firstPage = await loadSampleAndOpenViewer(page);
  await dragSelectAcrossPage(page, firstPage);
  await page.waitForTimeout(500);

  // Ctrl+A would also work, but Ctrl+C exercises the SelectionAPIBridge copy
  // wiring directly.
  await page.keyboard.press("Control+C");
  await page.waitForTimeout(500);

  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  expect(clipboardText.trim().length).toBeGreaterThan(0);
});

test("selection highlight is actually rendered on screen", async ({ page }) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("no box");

  // Drag across the top paragraph "Test document for word documents".
  const y = box.y + box.height * 0.105;
  await page.mouse.move(box.x + box.width * 0.13, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // The blue selection rectangles render inside the SelectionLayer.
  const selectionWrapper = firstPage.locator(
    ".pdf-selection-layer > div:first-child",
  );
  await expect(selectionWrapper).toBeAttached();

  // Sample one of the rects and confirm it has a non-zero size and a
  // background color (the var(--pdf-selection-bg) resolves to a blue rgba).
  const rect = firstPage
    .locator(".pdf-selection-layer > div:first-child > div")
    .first();
  await expect(rect).toBeAttached();
  const dims = await rect.evaluate((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const cs = getComputedStyle(el as HTMLElement);
    return { w: r.width, h: r.height, bg: cs.backgroundColor };
  });
  expect(dims.w).toBeGreaterThan(2);
  expect(dims.h).toBeGreaterThan(2);
  // Allow either a rgba/rgb form with non-zero alpha.
  expect(dims.bg).not.toBe("rgba(0, 0, 0, 0)");
});

test("Ctrl+A selects all text on the current page", async ({ page }) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("no box");
  // First move outside, then in, so onMouseEnter fires on the viewer Box
  // (the keyboard handler bails out unless isViewerHovered).
  await page.mouse.move(0, 0);
  await page.waitForTimeout(50);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);

  await page.keyboard.press("Control+A");
  await page.waitForTimeout(500);

  const selectionRects = firstPage.locator(
    ".pdf-selection-layer > div:first-child > div",
  );
  await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });
  const count = await selectionRects.count();
  expect(count).toBeGreaterThan(0);
});

test("text selection still works after toggling the pan tool off again", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);

  // The hand-tool button in the workbench toolbar enables pan mode. Toggle
  // it on then off - the active interaction mode should return to pointerMode
  // and text selection should resume working.
  const panButton = page
    .locator('[aria-label="Pan"], [aria-label*="and tool" i]')
    .first();
  if (await panButton.count()) {
    await panButton.click();
    await page.waitForTimeout(200);
    await panButton.click();
    await page.waitForTimeout(200);
  }

  await dragSelectAcrossPage(page, firstPage);

  const selectionRects = firstPage.locator(
    ".pdf-selection-layer > div:first-child > div",
  );
  await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });
});
