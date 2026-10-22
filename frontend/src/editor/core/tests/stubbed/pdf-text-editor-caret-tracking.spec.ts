import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Caret contract: the caret sits on the engine's pen position, not a
// browser-advance guess. The model carries fresh char positions in the same
// input event, and the overlay's visible glyph edge agrees with the caret
// before the browser paints the next frame.
// Sample.pdf carries an embedded TrueType face, so the overlay can render the
// same font as the bitmap. A Type 1 subset cannot become a FontFace; that case
// belongs to the page bitmap and is covered by the font-continuity spec.
const FIXTURE = path.join(import.meta.dirname, "../test-fixtures/Sample.pdf");

async function openRun(page: Page) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 45_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(FIXTURE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __editor_store?: { state: { firstPageRendered: boolean } };
              }
            ).__editor_store?.state.firstPageRendered ?? false,
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
  const run = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
  expect(await run.count(), "fixture should contain the heading").toBe(1);
  const testId = (await run.getAttribute("data-testid")) ?? "";
  await run.click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) => document.activeElement?.getAttribute("data-testid") === id,
        testId,
      ),
    )
    .toBe(true);
  return { testId, text: (await run.textContent()) ?? "" };
}

async function caretAt(page: Page, testId: string, offset: number) {
  await page.evaluate(
    ({ id, off }: { id: string; off: number }) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) throw new Error("run missing");
      const blocks = Array.from(
        el.querySelectorAll<HTMLElement>("[data-pdf-editor-line]"),
      );
      const scope = blocks[0] ?? el;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let seen = 0;
      let node = walker.nextNode();
      while (node) {
        const length = (node.nodeValue ?? "").length;
        if (seen + length >= off) {
          const range = document.createRange();
          range.setStart(node, off - seen);
          range.collapse(true);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          return;
        }
        seen += length;
        node = walker.nextNode();
      }
      const range = document.createRange();
      range.selectNodeContents(scope);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    },
    { id: testId, off: offset },
  );
}

interface CaretSample {
  text: string;
  caretOffset: number;
  caretLeft: number;
  expectedLeft: number;
  glyphRight: number;
  pristine: boolean;
  color: string;
  positionsMatchText: boolean;
  positionCount: number;
  /** x shift between the first frame and two frames later. */
  drift: number;
}

async function typeAndSample(
  page: Page,
  testId: string,
  chars: string,
): Promise<CaretSample[]> {
  return page.evaluate(
    async ({ id, input }: { id: string; input: string }) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) throw new Error("run missing");
      const store = (
        window as unknown as {
          __editor_store: {
            state: {
              pages: Array<{
                width: number;
                runs: Array<Record<string, unknown>>;
              }>;
            };
            doc: { page(i: number): { runs: Array<Record<string, unknown>> } };
          };
        }
      ).__editor_store;
      const runId = id.replace("pdf-editor-run-", "");
      const live = () =>
        store.doc.page(0).runs.find((r) => r.id === runId) ?? null;
      const pageEl = el.closest<HTMLElement>(
        "[data-testid^='pdf-editor-page-']",
      );
      if (!pageEl) throw new Error("page missing");
      const canvas = pageEl.querySelector("canvas");
      if (!canvas) throw new Error("canvas missing");
      const pageBox = canvas.getBoundingClientRect();
      const pageWidth = store.state.pages[0]?.width;
      if (!pageWidth) throw new Error("page width missing");
      // CSS pixels per PDF point: the page bitmap is laid out at `raster`
      // width, which is the snapshot width times the render scale.
      const cssScale = pageBox.width / pageWidth;

      const sel = window.getSelection();
      if (!sel) throw new Error("no selection api");
      const caretOffset = () => {
        const range = sel.getRangeAt(0);
        const before = document.createRange();
        before.setStart(el, 0);
        before.setEnd(range.startContainer, range.startOffset);
        return before.cloneContents().textContent?.length ?? 0;
      };
      const read = (): CaretSample => {
        const r = live() as {
          text: string;
          charStartsX: number[] | null;
          charEndsX: number[] | null;
          charPositionsKey: string | null;
        } | null;
        if (!r) throw new Error("run not in model");
        const off = caretOffset();
        const caret = sel.getRangeAt(0).getBoundingClientRect();
        const spans = Array.from(
          el.querySelectorAll<HTMLSpanElement>("[data-pdf-editor-token]"),
        );
        const last = spans[spans.length - 1];
        const glyphRight = last?.getBoundingClientRect().right ?? Number.NaN;
        const starts = r.charStartsX;
        const ends = r.charEndsX;
        let pen: number | null = null;
        if (starts && off < starts.length && Number.isFinite(starts[off])) {
          pen = starts[off];
        } else if (ends && off > 0 && Number.isFinite(ends[off - 1])) {
          pen = ends[off - 1];
        }
        const expectedLeft =
          pen === null ? Number.NaN : pageBox.left + pen * cssScale;
        return {
          text: r.text,
          caretOffset: off,
          caretLeft: caret.left,
          expectedLeft,
          glyphRight,
          pristine: el.classList.contains("is-pristine"),
          color: getComputedStyle(el).color,
          positionsMatchText:
            r.charPositionsKey?.split("\u0000")[0] === r.text &&
            r.charStartsX?.length === r.text.length,
          positionCount: r.charStartsX?.length ?? 0,
          drift: 0,
        };
      };

      const twoFrames = () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      const samples: CaretSample[] = [];
      for (const ch of input) {
        document.execCommand("insertText", false, ch);
        // First frame: React has committed the keystroke and the layout effect
        // has repainted on the engine's positions.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const first = read();
        await twoFrames();
        const later = read();
        first.drift = Math.abs(later.caretLeft - first.caretLeft);
        samples.push(first);
      }
      return samples;
    },
    { id: testId, input: chars },
  );
}

test.describe("PDF text editor - caret tracks the engine pen", () => {
  test("every keystroke updates positions and the painted caret in one frame", async ({
    page,
  }) => {
    test.setTimeout(140_000);
    const { testId, text } = await openRun(page);
    await caretAt(page, testId, text.length);
    const samples = await typeAndSample(page, testId, "abcdefghijkl");

    samples.forEach((sample, i) => {
      expect(sample.text.endsWith(`abcdefghijkl`.slice(0, i + 1))).toBe(true);
      expect(
        sample.positionsMatchText,
        `char positions were stale on keystroke ${i}`,
      ).toBe(true);
      expect(sample.positionCount, `position count on keystroke ${i}`).toBe(
        sample.text.length,
      );
      expect(sample.pristine, `overlay stayed hidden on keystroke ${i}`).toBe(
        false,
      );
      expect(sample.color).not.toBe("rgba(0, 0, 0, 0)");
      expect(
        Math.abs(sample.caretLeft - sample.glyphRight),
        `caret vs glyph on keystroke ${i}`,
      ).toBeLessThan(0.5);
      expect(
        Math.abs(sample.caretLeft - sample.expectedLeft),
        `caret vs engine pen on keystroke ${i}`,
      ).toBeLessThan(1);
      expect(
        sample.drift,
        `caret moved after the first frame at ${i}`,
      ).toBeLessThan(0.5);
    });
  });

  test("typing inside a word keeps the caret on the inserted glyph", async ({
    page,
  }) => {
    test.setTimeout(140_000);
    const { testId, text } = await openRun(page);
    await caretAt(page, testId, 5);
    const samples = await typeAndSample(page, testId, "QQ");

    for (const sample of samples) {
      expect(sample.positionsMatchText).toBe(true);
      expect(sample.pristine).toBe(false);
      expect(
        Math.abs(sample.caretLeft - sample.expectedLeft),
        `caret vs engine pen after "${sample.text}"`,
      ).toBeLessThan(1);
      expect(sample.drift).toBeLessThan(0.5);
    }
    expect(samples[samples.length - 1].text).toBe(
      `${text.slice(0, 5)}QQ${text.slice(5)}`,
    );
  });
});
