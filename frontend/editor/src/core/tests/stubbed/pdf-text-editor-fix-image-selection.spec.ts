import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Regressions for two selection bugs on the stage:
//   (A) a corner resize of an image dropped the image out of the selection,
//       because the resize handle's pointerdown bubbled to the stage's
//       "click empty space clears" handler and nothing re-selected after.
//   (B) a Ctrl+Shift marquee wiped the current selection at pointerdown even
//       when the rectangle went on to catch nothing.
//
// Both are measured off the DOM/geometry the user actually sees (outline
// style, overlay box) as well as the store, so a fix that only patches the
// store would still fail here.

const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");

// `[data-testid^="pdf-editor-image-"]` also matches the hidden file input; image
// overlays are always `pdf-editor-image-p<page>-<obj>`.
const IMG_SEL = '[data-testid^="pdf-editor-image-p"]';
const RUN_SEL = '[data-testid^="pdf-editor-run-p0-"]';

interface EditorWin {
  __editor_store: {
    selection: {
      value: { runIds: string[]; imageIds: string[] };
      selectMany: (ids: string[], additive?: boolean) => void;
      selectOne: (id: string) => void;
    };
  };
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function openSample(page: Page): Promise<void> {
  await page.route("**/encode-charcodes", (route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SAMPLE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
}

function selectedImageIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (window as unknown as EditorWin).__editor_store.selection.value.imageIds,
  );
}

function selectedRunIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (window as unknown as EditorWin).__editor_store.selection.value.runIds,
  );
}

/** Drag with intermediate steps so react-rnd / the marquee track the gesture. */
async function dragMouse(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

/** Ctrl+Shift+drag with the real mouse - the app's marquee gesture. */
async function marquee(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
  await page.waitForTimeout(250);
}

async function pageBox(page: Page): Promise<Rect> {
  const b = await page.getByTestId("pdf-editor-page-0").boundingBox();
  if (!b) throw new Error("page 0 has no bounding box");
  return b;
}

/**
 * Two points in the bare gutter LEFT of the page but still inside `pdf-editor-pages`
 * (the stage's clear-on-press target, and the only region the marquee arms in).
 * Outside `pdf-editor-pages` neither handler runs and any assertion would pass blind.
 */
async function gutter(page: Page): Promise<{
  from: { x: number; y: number };
  to: { x: number; y: number };
}> {
  const pages = await page.getByTestId("pdf-editor-pages").boundingBox();
  const p0 = await pageBox(page);
  if (!pages) throw new Error("pdf-editor-pages has no bounding box");
  const slack = p0.x - pages.x;
  expect(slack, "fixture needs bare stage left of the page").toBeGreaterThan(
    60,
  );
  return {
    from: { x: pages.x + slack * 0.25, y: p0.y + 120 },
    to: { x: pages.x + slack * 0.75, y: p0.y + 320 },
  };
}

test.describe("PDF text editor - selection survives resize, marquee never wipes blind", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.route("**/encode-charcodes", (route) => route.abort());
  });

  // (A) Before the fix: imageIds went ["p0-i46"] -> [] the instant the corner
  // handle was pressed, and the overlay outline fell back from solid to none.
  test("corner-resizing an image keeps the image selected", async ({
    page,
  }) => {
    await openSample(page);
    const img = page.locator(IMG_SEL).first();
    await expect(img).toBeVisible({ timeout: 30_000 });

    await img.click();
    await expect(img).toHaveCSS("outline-style", "solid");
    const before = await selectedImageIds(page);
    expect(before.length, "clicking the image selects it").toBe(1);

    const box = await img.boundingBox();
    if (!box) throw new Error("image overlay has no bounding box");
    await dragMouse(
      page,
      { x: box.x + box.width - 2, y: box.y + box.height - 2 },
      { x: box.x + box.width + 90, y: box.y + box.height + 45 },
    );
    await page.waitForTimeout(600);

    // The resize really happened (otherwise "still selected" proves nothing).
    const grown = await img.boundingBox();
    if (!grown) throw new Error("image overlay vanished after the resize");
    expect(
      grown.width - box.width,
      "the corner drag actually resized the overlay",
    ).toBeGreaterThan(60);

    const after = await selectedImageIds(page);
    expect(
      after,
      `the resized image stays selected (was ${JSON.stringify(before)}, now ${JSON.stringify(after)})`,
    ).toEqual(before);
    await expect(
      img,
      "the outline stays solid, not the dashed hover state",
    ).toHaveCSS("outline-style", "solid");
  });

  // Guard for (A): the stage must still clear when the user clicks bare space.
  test("clicking empty stage space still clears an image selection", async ({
    page,
  }) => {
    await openSample(page);
    const img = page.locator(IMG_SEL).first();
    await expect(img).toBeVisible({ timeout: 30_000 });
    await img.click();
    expect((await selectedImageIds(page)).length).toBe(1);

    const g = await gutter(page);
    await page.mouse.click(g.from.x, g.from.y);
    await page.waitForTimeout(200);
    expect(
      await selectedImageIds(page),
      "a plain click on empty space clears the selection",
    ).toEqual([]);
  });

  // (B) Before the fix: runIds went [id] -> [] because PageStage cleared at
  // the marquee's pointerdown, and the empty marquee never restored anything.
  test("a marquee that catches nothing leaves the existing selection alone", async ({
    page,
  }) => {
    await openSample(page);
    const run = page.locator(RUN_SEL).first();
    await expect(run).toBeVisible({ timeout: 30_000 });
    await run.click();
    const before = await selectedRunIds(page);
    expect(before.length, "clicking a run selects it").toBe(1);

    const g = await gutter(page);
    await marquee(page, g.from, g.to);

    const after = await selectedRunIds(page);
    expect(
      after,
      `an empty marquee must not wipe the selection (was ${JSON.stringify(before)}, now ${JSON.stringify(after)})`,
    ).toEqual(before);
  });

  // (B) The other half of the contract: a marquee that DOES catch runs still
  // replaces, so the fix above cannot have turned every marquee additive.
  test("a plain marquee replaces the selection with what it caught", async ({
    page,
  }) => {
    await openSample(page);
    await expect(page.locator(RUN_SEL).first()).toBeVisible({
      timeout: 30_000,
    });

    // Tight box around the first run, plus the ids that box actually covers.
    const target = await page.evaluate(() => {
      const runs = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid^="pdf-editor-run-p0-"]',
        ),
      );
      const id = (el: HTMLElement) =>
        el.dataset.testid!.replace(/^pdf-editor-run-/, "");
      const b = runs[0].getBoundingClientRect();
      const rect = {
        left: b.left - 4,
        top: b.top - 4,
        right: b.right + 4,
        bottom: b.bottom + 4,
      };
      const caught = runs
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.right >= rect.left &&
            r.left <= rect.right &&
            r.bottom >= rect.top &&
            r.top <= rect.bottom
          );
        })
        .map(id);
      return {
        rect,
        caught,
        first: id(runs[0]),
        last: id(runs[runs.length - 1]),
      };
    });
    expect(
      target.caught,
      "fixture check: this box must cover exactly the first run",
    ).toEqual([target.first]);
    expect(target.last).not.toBe(target.first);

    await page.evaluate(
      (id: string) =>
        (window as unknown as EditorWin).__editor_store.selection.selectOne(id),
      target.last,
    );
    expect(await selectedRunIds(page)).toEqual([target.last]);

    await marquee(
      page,
      { x: target.rect.left, y: target.rect.top },
      { x: target.rect.right, y: target.rect.bottom },
    );

    const after = await selectedRunIds(page);
    expect(
      after,
      `a plain marquee replaces (expected [${target.first}], got ${JSON.stringify(after)})`,
    ).toEqual([target.first]);
  });

  // Guard for (B): a plain (non-modifier) press on empty space still clears.
  test("a plain click on empty space still clears a run selection", async ({
    page,
  }) => {
    await openSample(page);
    const run = page.locator(RUN_SEL).first();
    await expect(run).toBeVisible({ timeout: 30_000 });
    await run.click();
    expect((await selectedRunIds(page)).length).toBe(1);

    const g = await gutter(page);
    await page.mouse.click(g.from.x, g.from.y);
    await page.waitForTimeout(200);
    expect(
      await selectedRunIds(page),
      "a plain click on empty space clears the run selection",
    ).toEqual([]);
  });

  // (B) The store-level seam an additive rectangle-select needs: replace by
  // default, union (order-preserving, deduped) when asked to extend.
  test("selectMany extends the selection when called additively", async ({
    page,
  }) => {
    await openSample(page);
    await expect(page.locator(RUN_SEL).first()).toBeVisible({
      timeout: 30_000,
    });
    const ids = await page
      .locator(RUN_SEL)
      .evaluateAll((els) =>
        els
          .slice(0, 3)
          .map((el) =>
            (el as HTMLElement).dataset.testid!.replace(/^pdf-editor-run-/, ""),
          ),
      );
    expect(ids.length, "fixture needs at least 3 runs").toBe(3);

    const result = await page.evaluate((rids: string[]) => {
      const sel = (window as unknown as EditorWin).__editor_store.selection;
      sel.selectMany([rids[0]]);
      const first = [...sel.value.runIds];
      sel.selectMany([rids[1], rids[2]], true);
      const extended = [...sel.value.runIds];
      sel.selectMany([rids[2]], true);
      const deduped = [...sel.value.runIds];
      sel.selectMany([rids[0]]);
      const replaced = [...sel.value.runIds];
      return { first, extended, deduped, replaced };
    }, ids);

    expect(result.first).toEqual([ids[0]]);
    expect(result.extended, "additive selectMany unions").toEqual(ids);
    expect(result.deduped, "additive selectMany does not duplicate").toEqual(
      ids,
    );
    expect(result.replaced, "the default stays replace").toEqual([ids[0]]);
  });
});
