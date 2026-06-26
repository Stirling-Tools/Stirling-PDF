import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");
const MULTIPAGE_PDF = path.join(FIXTURES_DIR, "annotations_out_of_order.pdf");

async function loadSampleAndOpenViewer(page: import("@playwright/test").Page) {
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);

  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });

  const selectionLayer = firstPage.locator(".pdf-selection-layer");
  await expect(selectionLayer).toBeAttached({ timeout: 15_000 });

  // Geometry must be loaded before hit-testing.
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

  // sample.pdf has "Test document for word documents" at ~11% from top.
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

  const targetX = box.x + box.width * 0.21;
  const targetY = box.y + box.height * 0.105;
  // Two-hop move so pointermove fires.
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

  await page.keyboard.press("Control+C");
  await page.waitForTimeout(500);

  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  expect(clipboardText.trim().length).toBeGreaterThan(0);
});

test("right-click on a word auto-selects it and reveals the Copy menu", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("no box");

  // Right-click on a word in the top paragraph "Test document for word documents".
  await page.mouse.click(box.x + box.width * 0.21, box.y + box.height * 0.105, {
    button: "right",
  });
  await page.waitForTimeout(400);

  const selectionRects = firstPage.locator(
    ".pdf-selection-layer > div:first-child > div",
  );
  await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });

  const copyButton = page.getByRole("button", { name: "Copy" }).first();
  await expect(copyButton).toBeVisible({ timeout: 5_000 });
});

test("right-click on the page does not surface the browser context menu", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("no box");

  // Track whether the browser would have opened a context menu (defaultPrevented stays false).
  const prevented = await page.evaluate(
    ([x, y]) =>
      new Promise<boolean>((resolve) => {
        const target = document.elementFromPoint(x, y);
        if (!target) {
          resolve(false);
          return;
        }
        const evt = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        });
        target.dispatchEvent(evt);
        resolve(evt.defaultPrevented);
      }),
    [box.x + box.width * 0.21, box.y + box.height * 0.105],
  );
  expect(prevented).toBe(true);
});

test("floating Copy menu appears after drag-select and copies", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const firstPage = await loadSampleAndOpenViewer(page);
  await dragSelectAcrossPage(page, firstPage);
  await page.waitForTimeout(500);

  const copyButton = page.getByRole("button", { name: "Copy" }).first();
  await expect(copyButton).toBeVisible({ timeout: 5_000 });

  await copyButton.click();
  await page.waitForTimeout(300);

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

  const y = box.y + box.height * 0.105;
  await page.mouse.move(box.x + box.width * 0.13, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const selectionWrapper = firstPage.locator(
    ".pdf-selection-layer > div:first-child",
  );
  await expect(selectionWrapper).toBeAttached();

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
  expect(dims.bg).not.toBe("rgba(0, 0, 0, 0)");
});

test("Ctrl+A selects all text in the document", async ({ page }) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("no box");
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
  expect(await selectionRects.count()).toBeGreaterThan(0);
});

test("Ctrl+A selects text on every page of a multi-page document", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.locator('input[type="file"]').first().setInputFiles(MULTIPAGE_PDF);

  // Wait until all 3 pages have rendered (the viewer pulls them in as the
  // scroll plugin reports them).
  const pageWrappers = page.locator("[data-page-index]");
  await expect.poll(() => pageWrappers.count(), { timeout: 30_000 }).toBe(3);
  // Geometry must be loaded before begin/update/end can produce rects.
  await page.waitForTimeout(2_000);

  await page.keyboard.press("Control+A");

  // After Ctrl+A, at least two pages should carry selection rects. That's
  // the multi-page invariant: single-page select-all would only ever paint
  // the page currently in view.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const wrappers = Array.from(
            document.querySelectorAll<HTMLElement>("[data-page-index]"),
          );
          return wrappers.filter(
            (w) =>
              w.querySelectorAll(".pdf-selection-layer > div:first-child > div")
                .length > 0,
          ).length;
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(2);
});

test("Ctrl+A works without first hovering the viewer", async ({ page }) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);

  // Park cursor far from the viewer so isViewerHovered is false.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);

  await page.keyboard.press("Control+A");
  await page.waitForTimeout(500);

  const selectionRects = firstPage.locator(
    ".pdf-selection-layer > div:first-child > div",
  );
  await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });
  expect(await selectionRects.count()).toBeGreaterThan(0);

  // Browser must not have ranged the surrounding UI chrome.
  const nativeSelectionLength = await page.evaluate(() => {
    const sel = window.getSelection();
    return sel ? sel.toString().length : 0;
  });
  expect(nativeSelectionLength).toBe(0);
});

test("text selection still works after toggling the pan tool off again", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);

  // Toggling pan on then off should return the active mode to pointerMode.
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
