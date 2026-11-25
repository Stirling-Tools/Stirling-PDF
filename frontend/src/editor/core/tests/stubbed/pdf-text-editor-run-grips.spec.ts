import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { EditorTestWindow } from "@editor/tests/stubbed/editorTestTypes";
import { waitForEditorReady } from "@editor/tests/stubbed/editorReady";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";

// Every click on a run's text places the caret; the move frame and the width
// handle sit just outside the box, so they never compete with the text.

const SAMPLE = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);
const RUN = "p0-t0";
// paragraph-sample's runs keep their lines under an explicit width, so the
// rewrap is checked on a run the reflow does re-break.
const REWRAP_SAMPLE = path.join(
  import.meta.dirname,
  "../../../../../public/samples/Sample.pdf",
);

async function open(page: Page, file = SAMPLE): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openInTextEditor(page, file);
  await waitForEditorReady(page, 60_000);
  await expect(
    page.locator('[data-testid^="pdf-editor-run-p0-"]').first(),
  ).toBeVisible({
    timeout: 30_000,
  });
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  text: string;
}

function boundsOf(page: Page, runId = RUN): Promise<Bounds> {
  return page.evaluate((id: string) => {
    const run = (window as unknown as EditorTestWindow).__editor_store.doc
      .page(0)
      .runs.find((r) => r.id === id);
    if (!run) throw new Error(`run ${id} not found`);
    return {
      x: run.bounds.x,
      y: run.bounds.y,
      width: run.bounds.width,
      text: run.text,
    };
  }, runId);
}

async function boxOf(page: Page, runId = RUN) {
  const box = await page.getByTestId(`pdf-editor-run-${runId}`).boundingBox();
  if (!box) throw new Error("run has no box");
  return box;
}

function charRect(page: Page, index: number) {
  return page.evaluate(
    ({ id, index }) => {
      const el = document.querySelector(
        `[data-testid="pdf-editor-run-${id}"]`,
      )!;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0;
        if (index < seen + length) {
          const range = document.createRange();
          range.setStart(node, index - seen);
          range.setEnd(node, index - seen + 1);
          const r = range.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width };
        }
        seen += length;
      }
      throw new Error(`no character ${index}`);
    },
    { id: RUN, index },
  );
}

function caretOffset(page: Page): Promise<number | null> {
  return page.evaluate((id: string) => {
    const el = document.querySelector(`[data-testid="pdf-editor-run-${id}"]`);
    const sel = window.getSelection();
    if (!el || document.activeElement !== el) return null;
    if (!sel?.focusNode || !el.contains(sel.focusNode)) return null;
    const range = document.createRange();
    range.setStart(el, 0);
    range.setEnd(sel.focusNode, sel.focusOffset);
    return range.toString().length;
  }, RUN);
}

function gripAt(page: Page, at: { x: number; y: number }) {
  return page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.getAttribute("data-grip") ?? null,
    at,
  );
}

function moveBandCentre(page: Page, edge: "bottom" | "left", runId = RUN) {
  return page.evaluate(
    ({ edge, runId }) => {
      const bands = [
        ...document.querySelectorAll(
          `[data-testid="pdf-editor-grips-${runId}"] [data-grip="move"]`,
        ),
      ].map((band) => band.getBoundingClientRect());
      if (bands.length === 0) return null;
      const band = bands.reduce((best, rect) =>
        edge === "bottom"
          ? rect.top > best.top
            ? rect
            : best
          : rect.right < best.right
            ? rect
            : best,
      );
      const centre = {
        x: band.left + band.width / 2,
        y: band.top + band.height / 2,
      };
      return document
        .elementFromPoint(centre.x, centre.y)
        ?.getAttribute("data-grip") === "move"
        ? centre
        : null;
    },
    { edge, runId },
  );
}

async function clickAndExpectCaret(
  page: Page,
  x: number,
  y: number,
  offset: number,
): Promise<void> {
  const before = await boundsOf(page);
  await page.mouse.click(x, y);
  await expect.poll(() => caretOffset(page), { timeout: 10_000 }).toBe(offset);
  const after = await boundsOf(page);
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeCloseTo(before.y, 1);
  await page.keyboard.press("Escape");
}

test.describe("PDF text editor - run grips", () => {
  test("clicks on the text place the caret instead of starting a drag", async ({
    page,
  }) => {
    await open(page);
    const { text } = await boundsOf(page);
    const last = text.trimEnd().length - 1;
    const box = await boxOf(page);

    const fifth = await charRect(page, 5);
    await clickAndExpectCaret(
      page,
      fifth.left + fifth.width * 0.75,
      box.y + box.height - 2,
      6,
    );

    const lastChar = await charRect(page, last);
    await clickAndExpectCaret(
      page,
      lastChar.left + lastChar.width * 0.75,
      box.y + box.height / 2,
      last + 1,
    );
    await clickAndExpectCaret(
      page,
      lastChar.right + 2,
      box.y + box.height / 2,
      last + 1,
    );
  });

  test("dragging just outside the bottom or left edge moves the box", async ({
    page,
  }) => {
    await open(page);
    for (const edge of ["bottom", "left"] as const) {
      const before = await boundsOf(page);
      const box = await boxOf(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      // The frame appears on hover. Leaving the box before it is drawn leaves
      // nothing to grab, and the press then starts a marquee instead.
      await expect(page.getByTestId(`pdf-editor-grips-${RUN}`)).toBeVisible();
      // Aim at the middle of the band as drawn: a point fixed from the box
      // rect sits under 2 px inside the band and misses it when the box and
      // frame lay out a pixel apart.
      let start = { x: 0, y: 0 };
      await expect
        .poll(async () => {
          const centre = await moveBandCentre(page, edge);
          if (centre) start = centre;
          return centre !== null;
        })
        .toBe(true);
      await page.mouse.move(start.x, start.y, { steps: 4 });
      await expect
        .poll(() => gripAt(page, start), { timeout: 10_000 })
        .toBe("move");
      await page.mouse.down();
      await page.mouse.move(start.x + 40, start.y + 30, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(async () => (await boundsOf(page)).x - before.x, {
          timeout: 10_000,
        })
        .toBeGreaterThan(20);
      const after = await boundsOf(page);
      expect(after.text).toBe(before.text);
    }
  });

  test("the width handle shows only while the box is selected or hovered", async ({
    page,
  }) => {
    await open(page);
    const handle = page.getByTestId(`pdf-editor-width-handle-${RUN}`);
    await page.mouse.move(5, 5);
    await expect(handle).toHaveCount(0);

    const box = await boxOf(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(5, 5);
    await expect(handle).toBeVisible();
    const h = await handle.boundingBox();
    const b = await boxOf(page);
    expect(h!.x).toBeGreaterThanOrEqual(b.x + b.width - 1);
    expect(h!.y + h!.height / 2).toBeCloseTo(b.y + b.height / 2, 0);
    await expect(handle).toHaveAttribute(
      "aria-label",
      "Drag to change the width; the text rewraps",
    );
  });

  test("dragging the width handle narrows the box and rewraps the text", async ({
    page,
  }) => {
    await open(page, REWRAP_SAMPLE);
    const id = await page.evaluate(
      () =>
        (window as unknown as EditorTestWindow).__editor_store.doc
          .page(0)
          .runs.find((r) => /Open Source/.test(r.text))?.id ?? "",
    );
    const before = await boundsOf(page, id);
    const box = await boxOf(page, id);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const handle = page.getByTestId(`pdf-editor-width-handle-${id}`);
    await expect(handle).toBeVisible();
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, h.y + h.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    await expect
      .poll(async () => (await boundsOf(page, id)).text, { timeout: 10_000 })
      .toContain("\n");
    const after = await boundsOf(page, id);
    expect(after.width).toBeLessThan(before.width);
    expect(after.text.split(/\s+/).filter(Boolean)).toEqual(
      before.text.split(/\s+/).filter(Boolean),
    );
  });
});
