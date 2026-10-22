import fs from "node:fs";
import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

interface SwapSamplerState {
  swapMs: number;
  swapAt: number;
  abs: number[];
  samples: number[];
  pageTops: number[];
  visible: boolean[];
  hidden: boolean[];
  liveCounts: number[];
  stop: boolean;
}

declare global {
  interface Window {
    __swapSampler?: SwapSamplerState;
    __revokedObjectUrls?: string[];
  }
}

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const MULTIPAGE_PDF = path.join(FIXTURES, "annotations_out_of_order.pdf");
const SAMPLE_PDF = path.join(FIXTURES, "sample.pdf");

async function loadViewer(
  page: import("@playwright/test").Page,
  fixture: string = MULTIPAGE_PDF,
  pages = 3,
) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 30_000 })
    .toBe(pages);
  await page.waitForTimeout(2_000);
  return firstPage;
}

async function hoverVisiblePage(page: import("@playwright/test").Page) {
  const point = await page.evaluate(() => {
    let best: { x: number; y: number; area: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>(
      "[data-page-index]",
    )) {
      const rect = el.getBoundingClientRect();
      const left = Math.max(0, Math.min(rect.left, window.innerWidth));
      const top = Math.max(0, Math.min(rect.top, window.innerHeight));
      const right = Math.max(0, Math.min(rect.right, window.innerWidth));
      const bottom = Math.max(0, Math.min(rect.bottom, window.innerHeight));
      const area = Math.max(0, right - left) * Math.max(0, bottom - top);
      if (!best || area > best.area) {
        best = { x: (left + right) / 2, y: (top + bottom) / 2, area };
      }
    }
    return best && best.area > 0 ? { x: best.x, y: best.y } : null;
  });
  if (point) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(150);
  }
}

async function highlightAllText(page: import("@playwright/test").Page) {
  // Ctrl+A is handled only while the viewer is hovered.
  await hoverVisiblePage(page);
  await page.keyboard.press("Control+A");
  await page.waitForTimeout(600);
  const highlight = page
    .locator('[data-text-selection-menu] button[aria-label="Highlight"]')
    .first();
  await expect(highlight).toBeVisible({ timeout: 5_000 });
  await highlight.click();
  await page.waitForTimeout(1_500);
}

async function saveDocument(page: import("@playwright/test").Page) {
  // The panel button only enables while the viewer has unsaved changes, so it
  // also asserts that the edit landed before the save.
  const save = page.getByRole("button", { name: "Save Changes" }).first();
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
}

function tagViewerWrapper(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const span = document.querySelector<HTMLElement>(
      ".ph-no-capture:has([data-page-index])",
    );
    span?.setAttribute("data-reload-probe", "1");
  });
}

function viewerWrapperSurvived(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => document.querySelector('[data-reload-probe="1"]') !== null,
  );
}

// Samples the scroller from the frame the outgoing pages are replaced, tracking
// mounted pages so the first rendered frame's position can be asserted.
async function startSwapSampler(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const outgoing = document.querySelector<HTMLElement>(
      '[data-page-index="0"]',
    );
    const outgoingAll = Array.from(
      document.querySelectorAll<HTMLElement>("[data-page-index]"),
    );
    // The viewer can unmount and remount while a tool page is open, so the
    // scroller is resolved per frame instead of captured once.
    const findScroller = () => {
      const pageEl = document.querySelector<HTMLElement>(
        '[data-page-index="0"]',
      );
      let scroller: HTMLElement | null = pageEl?.parentElement ?? null;
      while (scroller) {
        const style = getComputedStyle(scroller);
        if (
          /(auto|scroll)/.test(style.overflowY) &&
          scroller.scrollHeight > scroller.clientHeight
        )
          return scroller;
        scroller = scroller.parentElement;
      }
      return null;
    };
    const state: SwapSamplerState = {
      swapMs: -1,
      swapAt: -1,
      abs: [],
      samples: [],
      pageTops: [],
      visible: [],
      hidden: [],
      liveCounts: [],
      stop: false,
    };
    window.__swapSampler = state;
    let t0 = 0;
    const tick = () => {
      if (state.stop) return;
      const scroller = findScroller();
      const live = Array.from(
        document.querySelectorAll<HTMLElement>("[data-page-index]"),
      ).filter((el) => !outgoingAll.includes(el));
      if (!scroller || !outgoing || outgoing.isConnected || live.length === 0) {
        requestAnimationFrame(tick);
        return;
      }
      const rect = scroller.getBoundingClientRect();
      const viewerVisible = rect.width > 0 && rect.height > 0;
      if (state.swapMs < 0) {
        state.swapMs = performance.now();
        state.swapAt = Math.round(state.swapMs);
        t0 = state.swapMs;
      }
      const scrolledPage = document.querySelector<HTMLElement>(
        '[data-page-index="1"]',
      );
      state.abs.push(Math.round(performance.now()));
      state.hidden.push(getComputedStyle(scroller).visibility === "hidden");
      state.pageTops.push(
        scrolledPage
          ? Math.round(scrolledPage.getBoundingClientRect().top)
          : Number.NaN,
      );
      state.liveCounts.push(live.length);
      // Only frames the user can actually see count as flash.
      state.samples.push(Math.round(scroller.scrollTop));
      state.visible.push(viewerVisible);
      state.swapMs = Math.round(performance.now() - t0);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function sampleVisibleFramesOffTarget(
  pageTops: number[],
  liveCounts: number[],
  hidden: boolean[],
  fromIndex: number,
  baseline: number,
) {
  const offTarget: { index: number; top: number }[] = [];
  for (let index = fromIndex; index < pageTops.length; index++) {
    if (liveCounts[index] === 0 || hidden[index]) continue;
    const top = pageTops[index];
    if (!Number.isFinite(top)) continue;
    if (Math.abs(top - baseline) > 20) offTarget.push({ index, top });
  }
  return offTarget;
}

async function readSwapSampler(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const state = window.__swapSampler;
    if (!state) return null;
    state.stop = true;
    return state;
  });
}

// The reveal waits for the carried zoom, which slow engines can take seconds
// to land; sampling before it would read only hidden frames.
async function waitForRevealedFrame(page: import("@playwright/test").Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = window.__swapSampler;
          if (!state) return -1;
          return state.liveCounts.findIndex(
            (count, index) => count > 0 && state.hidden[index] !== true,
          );
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(0);
}
test("saving annotations keeps the live document mounted", async ({ page }) => {
  test.setTimeout(180_000);
  await loadViewer(page);
  await highlightAllText(page);

  const undo = page.getByRole("button", { name: "Undo" }).first();
  await expect(undo).toBeEnabled({ timeout: 5_000 });

  // Give the reload a position and a manual zoom worth carrying over.
  await page.getByRole("button", { name: "Next Page" }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Zoom In" }).first().click();
  await page.waitForTimeout(500);
  const zoomBefore = await page.getByText(/%$/).first().textContent();
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(400);
  const pageTop = (index: number) =>
    page
      .locator(`[data-page-index="${index}"]`)
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const pageTopBefore = await pageTop(1);
  const pageInput = page.getByRole("textbox").first();
  expect(await pageInput.inputValue()).toBe("2");

  // Tag the viewer wrapper: it lives above the document subtree, so it
  // survives an in-place reload and is replaced by a remount.
  await tagViewerWrapper(page);
  // Tag the page nodes themselves: the viewer save keeps the live document,
  // so the very same nodes must still be mounted after the save.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-page-index]")) {
      el.setAttribute("data-reload-page-probe", "1");
    }
  });
  // Other hooks may replace their own URLs; only LocalEmbedPDF's revocations
  // matter, because its published URL feeds PrintAPIBridge.
  await page.evaluate(() => {
    const revoked: string[] = [];
    window.__revokedObjectUrls = revoked;
    const original = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      revoked.push(`${url}\n${new Error("revoke").stack ?? ""}`);
      return original(url);
    };
  });
  await saveDocument(page);

  // The save replaces the workbench record and clears the unsaved state.
  const save = page.getByRole("button", { name: "Save Changes" }).first();
  await expect(save).toBeDisabled({ timeout: 15_000 });
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 15_000 })
    .toBe(3);

  // The mount and the surrounding viewer survive the byte replacement...
  expect(await viewerWrapperSurvived(page)).toBe(true);
  // ...and the document itself is not reopened: the page nodes are the same.
  expect(
    await page.evaluate(
      () =>
        document.querySelectorAll('[data-reload-page-probe="1"]').length === 3,
    ),
  ).toBe(true);
  const viewerRevokedBlobUrls = await page.evaluate(() =>
    (window.__revokedObjectUrls ?? []).filter((entry) =>
      entry.includes("LocalEmbedPDF"),
    ),
  );
  expect(viewerRevokedBlobUrls).toEqual([]);
  // The within-page offset must hold across the save: snapping to the page top
  // reads as a jump.
  await expect
    .poll(async () => pageInput.inputValue(), { timeout: 10_000 })
    .toBe("2");
  await expect
    .poll(async () => Math.abs((await pageTop(1)) - pageTopBefore) <= 2, {
      timeout: 15_000,
    })
    .toBe(true);
  await expect
    .poll(async () => page.getByText(/%$/).first().textContent(), {
      timeout: 10_000,
    })
    .toBe(zoomBefore);
});

test("consecutive saves each keep the live document", async ({ page }) => {
  test.setTimeout(180_000);
  await loadViewer(page);
  const undo = page.getByRole("button", { name: "Undo" }).first();

  await highlightAllText(page);
  await tagViewerWrapper(page);

  const save = page.getByRole("button", { name: "Save Changes" }).first();
  for (const round of [1, 2]) {
    await saveDocument(page);
    await expect(save).toBeDisabled({ timeout: 15_000 });
    await expect
      .poll(() => page.locator("[data-page-index]").count(), {
        timeout: 15_000,
      })
      .toBe(3);
    expect(await viewerWrapperSurvived(page)).toBe(true);

    if (round === 1) {
      // Dirty the surviving document again on the same page.
      await highlightAllText(page);
      await expect(undo).toBeEnabled({ timeout: 5_000 });
    }
  }
});

test("a reload keeps other open viewer surfaces", async ({ page }) => {
  test.setTimeout(180_000);
  await loadViewer(page);

  const comments = page.getByRole("button", { name: "Comments" }).first();
  await comments.click();
  await expect(page.locator(".comments-sidebar").first()).toBeVisible({
    timeout: 5_000,
  });

  await highlightAllText(page);
  const save = page.getByRole("button", { name: "Save Changes" }).first();
  await saveDocument(page);
  await expect(save).toBeDisabled({ timeout: 15_000 });

  await expect(page.locator(".comments-sidebar").first()).toBeVisible();
});

test("text selection and undo survive a reload", async ({ page }) => {
  test.setTimeout(180_000);
  const firstPage = await loadViewer(page, SAMPLE_PDF, 1);
  const selectionRects = firstPage.locator(
    ".pdf-selection-layer > div:first-child > div",
  );
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Sample page has no bounding box");
  const y = box.y + box.height * 0.105;
  const dragSelect = async () => {
    await page.mouse.move(box.x + box.width * 0.15, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
    await page.mouse.up();
  };

  await dragSelect();
  const highlight = page
    .locator('[data-text-selection-menu] button[aria-label="Highlight"]')
    .first();
  await expect(highlight).toBeVisible({ timeout: 5_000 });
  await highlight.click();
  await page.waitForTimeout(1_200);

  const undo = page.getByRole("button", { name: "Undo" }).first();
  const save = page.getByRole("button", { name: "Save Changes" }).first();
  await expect(undo).toBeEnabled({ timeout: 5_000 });
  await saveDocument(page);
  await expect(save).toBeDisabled({ timeout: 15_000 });

  // Text selection still produces rects after the save, so retry until the
  // selection layer is hit-testable again.
  await expect
    .poll(
      async () => {
        await dragSelect();
        await page.waitForTimeout(300);
        return selectionRects.count();
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);

  // History keeps working after a save, and undoing past the saved state makes
  // the document dirty again rather than being silently purged.
  await highlightAllText(page);
  await expect(undo).toBeEnabled({ timeout: 5_000 });
  await undo.click();
  // Undoing past the saved state makes the document dirty again, which is the
  // point: a save no longer throws the user's history away.
  await expect(save).toBeEnabled({ timeout: 5_000 });
});

test("a different document remounts and shows its own bytes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loadViewer(page);
  await tagViewerWrapper(page);

  // A different lineage root cannot share the mount: the viewer remounts.
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 30_000 })
    .toBe(1);
  expect(await viewerWrapperSurvived(page)).toBe(false);
});

test("tool output reloads the document in place", async ({ page }) => {
  test.setTimeout(240_000);
  await loadViewer(page);
  await tagViewerWrapper(page);

  // Reach the tool picker without leaving the viewer: a viewer tool, then
  // back to the picker. The workbench stays on "viewer" throughout.
  await page
    .getByRole("button", { name: "Redact", exact: true })
    .first()
    .click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Back to all tools" }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("link", { name: "Crop PDF" }).first().click();
  await page.waitForTimeout(1_200);

  // Answer the crop with a different, valid PDF so the reload is observable.
  await page.route("**/api/v1/general/crop", async (route) => {
    const bytes = await fs.promises.readFile(SAMPLE_PDF);
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: bytes,
      headers: { "content-disposition": 'attachment; filename="cropped.pdf"' },
    });
  });
  await page.getByRole("button", { name: "Apply Crop" }).first().click();

  // The output replaces the open record under the surviving mount.
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 30_000 })
    .toBe(1);
  expect(await viewerWrapperSurvived(page)).toBe(true);
});

test("a tool output reload shows the saved position in its first frame", async ({
  page,
  browserName,
}) => {
  test.setTimeout(240_000);
  await loadViewer(page);
  await page.getByRole("button", { name: "Next Page" }).first().click();
  await page.waitForTimeout(800);
  // A manual zoom makes the restore use the fraction path, whose reveal used
  // to wait for the deadline because the page height legitimately changed.
  await page.getByRole("button", { name: "Zoom In" }).first().click();
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(500);

  // Same bytes back, so the captured offset is exactly reproducible.
  await page.route("**/api/v1/misc/compress-pdf", async (route) => {
    const bytes = await fs.promises.readFile(MULTIPAGE_PDF);
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: bytes,
      headers: {
        "Content-Disposition": 'attachment; filename="compressed.pdf"',
      },
    });
  });

  await page
    .getByRole("button", { name: "Redact", exact: true })
    .first()
    .click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Back to all tools" }).first().click();
  await page.waitForTimeout(800);
  await page
    .getByRole("link", { name: "Compress", exact: true })
    .first()
    .click();
  await page.waitForTimeout(1_200);

  // Read the baseline once the panel has settled; the tool page can otherwise
  // contribute its own preview pages to the sample stream.
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const pageTopBefore = await page
    .locator('[data-page-index="1"]')
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().top));
  await startSwapSampler(page);
  await page
    .getByRole("button", { name: "Compress", exact: true })
    .first()
    .click();

  // The reload replaces the bytes; no frame may show the top of the document.
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 60_000 })
    .toBe(3);
  await waitForRevealedFrame(page);
  const swap = await readSwapSampler(page);
  const samples = swap?.samples ?? [];
  const pageTops = swap?.pageTops ?? [];
  const hidden = swap?.hidden ?? [];
  const liveCounts = swap?.liveCounts ?? [];
  if (samples.length === 0) {
    // React reused the mounted page nodes across the swap, so nothing could
    // have jumped; the page must still sit where it was.
    await expect
      .poll(
        async () =>
          pageTopBefore -
          (await page
            .locator('[data-page-index="1"]')
            .first()
            .evaluate((el) => Math.round(el.getBoundingClientRect().top))),
        { timeout: 10_000 },
      )
      .toBeLessThanOrEqual(2);
    return;
  }

  // The replacement is hidden while it settles, so the first visible frame must
  // already show the page where it was and every later one must hold it.
  const firstVisibleRendered = samples.findIndex(
    (_, index) => liveCounts[index] > 0 && hidden[index] !== true,
  );
  expect(firstVisibleRendered).toBeGreaterThanOrEqual(0);
  const offTarget = sampleVisibleFramesOffTarget(
    pageTops,
    liveCounts,
    hidden,
    firstVisibleRendered,
    pageTopBefore,
  );
  expect(offTarget).toEqual([]);

  // The replacement must be revealed as soon as its geometry settles, not at
  // the deadline. Twelve frames is about 200 ms of slack.
  const hiddenAfterFirstRender = samples.filter(
    (_, index) => index > firstVisibleRendered && hidden[index] === true,
  ).length;
  expect(hiddenAfterFirstRender).toBeLessThanOrEqual(12);
});

test("rotation carries over an in-place reload", async ({ page }) => {
  test.setTimeout(180_000);
  const firstPage = await loadViewer(page, SAMPLE_PDF, 1);

  const dims = async () => {
    const box = await firstPage.boundingBox();
    return box
      ? { width: Math.round(box.width), height: Math.round(box.height) }
      : null;
  };
  const before = await dims();
  if (!before) throw new Error("Sample page has no bounding box");

  await page.getByRole("button", { name: "Rotate Left" }).first().click();
  await expect
    .poll(
      async () => {
        const now = await dims();
        return now ? now.width > now.height : false;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  const rotated = await dims();
  expect(rotated?.width).toBe(before.height);

  await highlightAllText(page);
  const save = page.getByRole("button", { name: "Save Changes" }).first();
  await saveDocument(page);
  await expect(save).toBeDisabled({ timeout: 15_000 });

  // The page element is momentarily detached during the swap, so tolerate a
  // missing box while polling.
  await expect
    .poll(
      async () => {
        const now = await dims();
        return now ? now.width > now.height : false;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
});

test("a save clears the unsaved state so tools stay reachable", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadViewer(page);
  await highlightAllText(page);
  await saveDocument(page);

  // Navigating away must not raise the unsaved-changes dialog after a save.
  await page
    .getByRole("button", { name: "Redact", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Back to all tools" }).first(),
  ).toBeVisible({ timeout: 15_000 });
});
