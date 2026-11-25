import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
import {
  downloadBytes,
  reopenSavedBytes,
  saveAndDownload,
} from "@editor/tests/stubbed/saveHelpers";

// Bold on words selected inside a text box makes those words bold on the page,
// and only them, the way a word processor does.

const TAGGED_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/tagged-sample.pdf",
);
const BODY = "Revenue grew in every region this quarter,";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EditorWindow {
  __editor_store?: {
    state: { pages: { runs: { id: string; text: string }[] }[] };
    selection: { value: { textRange: { start: number; end: number } | null } };
  };
}

async function openEditor(page: Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openInTextEditor(page, file);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await expect.poll(() => bodyRun(page), { timeout: 30_000 }).toBeTruthy();
}

function bodyRun(page: Page): Promise<{ id: string; text: string } | null> {
  return page.evaluate((body) => {
    const w = window as unknown as EditorWindow;
    return (
      w.__editor_store?.state.pages[0]?.runs.find((r) =>
        r.text.startsWith(body),
      ) ?? null
    );
  }, BODY);
}

/** Where `word` sits in the run's box, read from the box's own text. */
function wordRect(page: Page, runId: string, word: string): Promise<Rect> {
  return page.evaluate(
    ({ runId, word }) => {
      const el = document.querySelector(
        `[data-testid="pdf-editor-run-${runId}"]`,
      )!;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let text = "";
      while (walker.nextNode()) {
        nodes.push(walker.currentNode as Text);
        text += (walker.currentNode as Text).data;
      }
      const locate = (at: number): [Text, number] => {
        for (const node of nodes) {
          if (at <= node.data.length) return [node, at];
          at -= node.data.length;
        }
        const last = nodes[nodes.length - 1];
        return [last, last.data.length];
      };
      const start = text.indexOf(word);
      const range = document.createRange();
      range.setStart(...locate(start));
      range.setEnd(...locate(start + word.length));
      // A range starting at a line break also covers the end of the line before it.
      const rects = range.getClientRects();
      const r = rects[rects.length - 1] ?? range.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    { runId, word },
  );
}

/** How much ink the page bitmap has under each rect. */
function inkUnder(page: Page, rects: Rect[]): Promise<number[]> {
  return page.evaluate((rects) => {
    const canvas = Array.from(
      document.querySelectorAll<HTMLCanvasElement>(
        '[data-testid="pdf-editor-page-0"] canvas',
      ),
    ).find((c) => c.width > 0 && c.height > 0)!;
    const box = canvas.getBoundingClientRect();
    const sx = canvas.width / box.width;
    const sy = canvas.height / box.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    return rects.map((r) => {
      const data = ctx.getImageData(
        Math.round((r.x - box.x) * sx),
        Math.round((r.y - box.y) * sy),
        Math.max(1, Math.round(r.width * sx)),
        Math.max(1, Math.round(r.height * sy)),
      ).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4)
        ink += 255 - (data[i] + data[i + 1] + data[i + 2]) / 3;
      return ink / 255;
    });
  }, rects);
}

/** The ink under each rect once the bitmap has stopped changing. */
async function settledInk(page: Page, rects: Rect[]): Promise<number[]> {
  let last = "";
  let ink: number[] = [];
  await expect
    .poll(
      async () => {
        ink = await inkUnder(page, rects);
        const key = ink.map((v) => v.toFixed(1)).join();
        const same = key === last;
        last = key;
        return same;
      },
      { timeout: 20_000, intervals: [300] },
    )
    .toBe(true);
  return ink;
}

function textRange(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as EditorWindow).__editor_store?.selection.value
        .textRange ?? null,
  );
}

async function wordRects(page: Page, runId: string, words: string[]) {
  const rects: Rect[] = [];
  for (const word of words) rects.push(await wordRect(page, runId, word));
  return rects;
}

const WORDS = ["Revenue grew in", "every", "region", "led by demand"];

test.describe("PDF text editor - Bold on selected words", () => {
  test("Bold on a double-clicked word and on a word picked out with Shift+arrows makes only those words heavier, and a save keeps them", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, TAGGED_PDF);
    const { id } = (await bodyRun(page))!;
    const rects = await wordRects(page, id, WORDS);
    const before = await settledInk(page, rects);
    const box = page.getByTestId(`pdf-editor-run-${id}`);

    await box.click({ position: { x: 4, y: 4 } });
    const every = rects[1];
    await page.mouse.dblclick(
      every.x + every.width / 2,
      every.y + every.height / 2,
    );
    const start = BODY.indexOf("every");
    await expect
      .poll(() => textRange(page))
      .toMatchObject({ start, end: expect.any(Number) });
    await expect(page.getByTestId("pdf-editor-bold")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.keyboard.press("ControlOrMeta+b");

    await expect
      .poll(async () => (await inkUnder(page, [every]))[0], {
        timeout: 20_000,
      })
      .toBeGreaterThan(before[1] * 1.2);
    const bolded = await settledInk(page, rects);
    expect(bolded[0] / before[0]).toBeCloseTo(1, 1);
    expect(bolded[3] / before[3]).toBeCloseTo(1, 1);
    expect((await bodyRun(page))!.text.startsWith(BODY)).toBe(true);

    const region = await wordRect(page, id, "region");
    await page.mouse.dblclick(
      region.x + region.width / 2,
      region.y + region.height / 2,
    );
    await page.keyboard.press("ArrowLeft");
    for (let i = 0; i < "region".length; i++)
      await page.keyboard.press("Shift+ArrowRight");
    const regionAt = BODY.indexOf("region");
    await expect
      .poll(() => textRange(page))
      .toEqual({ start: regionAt, end: regionAt + "region".length });
    await page.keyboard.press("ControlOrMeta+b");

    await expect
      .poll(async () => (await inkUnder(page, [region]))[0], {
        timeout: 20_000,
      })
      .toBeGreaterThan(before[2] * 1.2);
    const bothBold = await settledInk(page, rects);
    await expect(page.getByTestId("pdf-editor-bold")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(bothBold[0] / before[0]).toBeCloseTo(1, 1);
    expect(bothBold[3] / before[3]).toBeCloseTo(1, 1);

    const saved = await downloadBytes(await saveAndDownload(page, false));
    expect(saved.toString("latin1")).toContain("/Helvetica-Bold");
    await reopenSavedBytes(page, saved, "saved.pdf", 0, 60_000);
    const reopened = (await bodyRun(page))!;
    expect(reopened.text.startsWith(BODY)).toBe(true);
    const reopenedRects = await wordRects(page, reopened.id, WORDS);
    await expect
      .poll(async () => (await inkUnder(page, reopenedRects))[1], {
        timeout: 20_000,
      })
      .toBeGreaterThan(before[1] * 1.2);
    const after = await settledInk(page, reopenedRects);
    expect(after[2]).toBeGreaterThan(before[2] * 1.2);
    expect(after[0] / before[0]).toBeCloseTo(1, 1);
    expect(after[3] / before[3]).toBeCloseTo(1, 1);
  });
});
