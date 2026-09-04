import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
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
  browserName,
}) => {
  // Reading the clipboard requires the `clipboard-read` permission, which only
  // chromium supports via `grantPermissions` (firefox throws "Unknown
  // permission"; webkit can't expose `navigator.clipboard.readText` in tests).
  test.skip(
    browserName !== "chromium",
    "clipboard read/permissions are chromium-only in Playwright",
  );
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

// Pinned wide: the page is auto-fit, so at the 1280x720 firefox/webkit projects
// the text renders too small to hit-test a word reliably.
test.describe("right-click selection", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("right-click on a word auto-selects it and reveals the Copy menu", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const firstPage = await loadSampleAndOpenViewer(page);
    const box = await firstPage.boundingBox();
    if (!box) throw new Error("no box");

    // Right-click a word in the top paragraph "Test document for word documents".
    await page.mouse.click(
      box.x + box.width * 0.21,
      box.y + box.height * 0.105,
      { button: "right" },
    );
    await page.waitForTimeout(400);

    const selectionRects = firstPage.locator(
      ".pdf-selection-layer > div:first-child > div",
    );
    await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });

    const copyButton = page.getByRole("button", { name: "Copy" }).first();
    await expect(copyButton).toBeVisible({ timeout: 5_000 });
  });
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
  browserName,
}) => {
  // Verifying the copy result reads the clipboard, which needs the
  // `clipboard-read` permission - chromium-only in Playwright. The Copy menu's
  // appearance is covered cross-browser by the right-click test above.
  test.skip(
    browserName !== "chromium",
    "clipboard read/permissions are chromium-only in Playwright",
  );
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

async function togglePanOnThenOff(page: import("@playwright/test").Page) {
  const panButton = page.locator('[aria-label="Pan Mode"]').first();
  await expect(panButton).toBeVisible({ timeout: 10_000 });
  await panButton.click();
  await page.waitForTimeout(200);
  await panButton.click();
  await page.waitForTimeout(200);
}

test("text selection still works after toggling the pan tool off again", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const firstPage = await loadSampleAndOpenViewer(page);

  // Toggling pan on then off must land back in pointerMode, not the default mode.
  await togglePanOnThenOff(page);
  await dragSelectAcrossPage(page, firstPage);

  const selectionRects = firstPage.locator(
    ".pdf-selection-layer > div:first-child > div",
  );
  await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });
});

// hasTouch is required: the pan plugin's defaultConfig is "mobile", so only a
// touch-capable context reproduces the pan lock that kills selection (#5175).
test.describe("pan mode on a touch-capable device", () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox stops dispatching PointerEvents for the mouse once
  // hasTouch is on, so no pointer-driven interaction can be exercised there.
  const skipPointerOnFirefox = (browserName: string) =>
    test.skip(
      browserName === "firefox",
      "Playwright Firefox emits no PointerEvents for the mouse when hasTouch is set",
    );

  test("the viewer does not open locked in pan mode", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    skipPointerOnFirefox(browserName);
    const firstPage = await loadSampleAndOpenViewer(page);

    await dragSelectAcrossPage(page, firstPage);

    const selectionRects = firstPage.locator(
      ".pdf-selection-layer > div:first-child > div",
    );
    await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });
  });

  test("text selection still works after toggling the pan tool off again", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    skipPointerOnFirefox(browserName);
    const firstPage = await loadSampleAndOpenViewer(page);

    await togglePanOnThenOff(page);
    await dragSelectAcrossPage(page, firstPage);

    const selectionRects = firstPage.locator(
      ".pdf-selection-layer > div:first-child > div",
    );
    await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });
  });

  // Guards the other half of the trade: leaving the viewer in pointerMode must
  // not make the interaction manager claim raw touch and block native scrolling.
  test("a finger swipe still scrolls the document", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    // Multi-page so the viewport always overflows, whatever the window size.
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(MULTIPAGE_PDF);
    const firstPage = page.locator('[data-page-index="0"]').first();
    await expect(firstPage).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_000);

    // touch-action:none anywhere between the page and its scroll container
    // stops the browser panning that container with a finger.
    const chain = await page.evaluate(() => {
      let cur = document.querySelector(
        '[data-page-index="0"]',
      ) as HTMLElement | null;
      const touchActions: string[] = [];
      while (cur) {
        const style = getComputedStyle(cur);
        touchActions.push(style.touchAction);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          return { touchActions, foundScroller: true };
        }
        cur = cur.parentElement;
      }
      return { touchActions, foundScroller: false };
    });
    expect(chain.foundScroller).toBe(true);
    expect(chain.touchActions).not.toContain("none");

    // Chromium is the only engine Playwright lets us inject trusted touches into.
    if (browserName !== "chromium") return;

    const readScroll = () =>
      page.evaluate(() => {
        let cur = document.querySelector(
          '[data-page-index="0"]',
        ) as HTMLElement | null;
        while (cur) {
          const style = getComputedStyle(cur);
          if (style.overflowY === "auto" || style.overflowY === "scroll") {
            return {
              top: cur.scrollTop,
              overflows: cur.scrollHeight > cur.clientHeight,
            };
          }
          cur = cur.parentElement;
        }
        return { top: -1, overflows: false };
      });

    const before = await readScroll();
    expect(before.overflows).toBe(true);

    const box = await firstPage.boundingBox();
    if (!box) throw new Error("Page wrapper has no bounding box");
    const x = box.x + box.width * 0.5;
    const yStart = box.y + box.height * 0.5;

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: yStart }],
    });
    for (let step = 1; step <= 10; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: yStart - step * 20 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(1_000);

    expect((await readScroll()).top).toBeGreaterThan(before.top);
  });
});
