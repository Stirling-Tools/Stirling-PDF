import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Two things the user sees go wrong while typing into a run, both because the
// overlay and the page bitmap disagree about where the text is:
//
//   * Enter at the end of a line read back as TWO line breaks, and the caret,
//     parked by the browser inside the empty token span it left behind, was
//     lost on the next repaint - so the next character landed at the top of
//     the run instead of on the new line.
//   * While the user types, the engine holds off re-measuring pen positions
//     until typing pauses, so the overlay lays the new text out on the
//     browser's advances while the page renders it on the PDF's. The caret
//     walked off the glyphs, a fraction of a pixel per keystroke.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);
const MUSHROOM_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/mushroom-life.pdf",
);

async function openV2(page: import("@playwright/test").Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

function modelTextOf(page: import("@playwright/test").Page, testId: string) {
  return page.evaluate((id) => {
    const w = window as unknown as {
      __v2_editor_store: {
        state: { pages: { runs: { id: string; text: string }[] }[] };
      };
    };
    for (const p of w.__v2_editor_store.state.pages) {
      for (const r of p.runs) if (`v2-run-${r.id}` === id) return r.text;
    }
    return "";
  }, testId);
}

/** Put the caret `offset` characters into the run's `index`-th painted line. */
async function caretInLine(
  page: import("@playwright/test").Page,
  testId: string,
  index: number,
  offset: number,
) {
  await page.evaluate(
    ({ id, index, offset }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${id}"]`,
      );
      if (!el) throw new Error(`no run ${id}`);
      el.focus();
      const scope = (el.children[index] as HTMLElement) ?? el;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let seen = 0;
      let node = walker.nextNode();
      while (node) {
        const length = (node.nodeValue ?? "").length;
        if (seen + length >= offset) {
          const range = document.createRange();
          range.setStart(node, offset - seen);
          range.collapse(true);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          return;
        }
        seen += length;
        node = walker.nextNode();
      }
      throw new Error("offset past the end of the line");
    },
    { id: testId, index, offset },
  );
}

// The caret's x, and the right edge of the glyphs the user can actually see -
// the overlay's own text while it is unmasked, the page bitmap while it is not.
function caretVersusGlyphs(
  page: import("@playwright/test").Page,
  testId: string,
) {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLDivElement>(`[data-testid="${id}"]`);
    const selection = window.getSelection();
    if (!el || !selection || selection.rangeCount === 0) return null;
    const caret = selection.getRangeAt(0).getBoundingClientRect();
    const focusNode = selection.focusNode;
    const pristine = el.classList.contains("is-pristine");

    if (!pristine && focusNode?.nodeType === Node.TEXT_NODE) {
      const glyphs = document.createRange();
      glyphs.selectNodeContents(focusNode);
      return {
        pristine,
        gap: caret.left - glyphs.getBoundingClientRect().right,
      };
    }

    // Transparent overlay: the glyphs on screen are the page's own bitmap, so
    // read the rightmost inked pixel on the caret's row.
    const canvas = el
      .closest("[data-testid^='v2-page-']")
      ?.querySelector("canvas") as HTMLCanvasElement | null;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return null;
    const box = canvas.getBoundingClientRect();
    const sx = canvas.width / box.width;
    const sy = canvas.height / box.height;
    const top = Math.max(0, Math.floor((caret.top - box.top) * sy));
    const bottom = Math.min(
      canvas.height,
      Math.ceil((caret.bottom - box.top) * sy),
    );
    const band = ctx.getImageData(
      0,
      top,
      canvas.width,
      Math.max(1, bottom - top),
    );
    let rightmost = -1;
    for (let y = 0; y < band.height; y += 1) {
      for (let x = canvas.width - 1; x > rightmost; x -= 1) {
        const i = (y * canvas.width + x) * 4;
        if (band.data[i] < 160 && band.data[i + 1] < 160) {
          rightmost = x;
          break;
        }
      }
    }
    if (rightmost < 0) return null;
    return { pristine, gap: caret.left - (box.left + rightmost / sx) };
  }, testId);
}

test.describe("v2 editor - Enter keeps the caret on the new line", () => {
  test("Enter at the end of a line adds ONE line and types onto it", async ({
    page,
  }) => {
    await openV2(page, PARAGRAPH_PDF);
    const run = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /First line of the body/ })
      .first();
    const testId = (await run.getAttribute("data-testid")) ?? "";
    await run.click();
    await page.waitForTimeout(300);

    const before = await modelTextOf(page, testId);
    const lines = before.split("\n");
    expect(lines.length, "fixture should be a multi-line paragraph").toBe(4);

    await caretInLine(page, testId, 1, lines[1].length);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);

    const after = await modelTextOf(page, testId);
    expect(after.split("\n"), "one Enter is one line break").toHaveLength(5);
    expect(after.split("\n")[2]).toBe("");

    // The next character has to land on the NEW line, not at the top of the
    // run: the caret used to be dropped by the repaint that followed.
    await page.keyboard.type("ZZ");
    await page.waitForTimeout(1500);
    expect((await modelTextOf(page, testId)).split("\n")[2]).toBe("ZZ");
  });

  test("Enter mid-line splits it and types onto the second half", async ({
    page,
  }) => {
    await openV2(page, PARAGRAPH_PDF);
    const run = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /First line of the body/ })
      .first();
    const testId = (await run.getAttribute("data-testid")) ?? "";
    await run.click();
    await page.waitForTimeout(300);

    await caretInLine(page, testId, 1, 6); // "Second| line continues..."
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
    await page.keyboard.type("ZZ");
    await page.waitForTimeout(1500);

    const after = (await modelTextOf(page, testId)).split("\n");
    expect(after).toHaveLength(5);
    expect(after[1]).toBe("Second");
    expect(after[2].startsWith("ZZ")).toBe(true);
  });
});

// Guards caret drift during a typing burst. The bitmap is never the culprit:
// PDFium re-rasterises in milliseconds. The engine's pen positions are, and a
// debounce that clears its timer on every dispatch never refreshes them, so
// the overlay falls back to browser advances - a percent wider - and the caret
// walks off the glyphs by the difference.
//
// Masking the page and letting the overlay paint its own glyphs also hides
// this, and is the wrong trade: it changes the typeface mid-word. See
// pdf-text-editor-v2-edit-mask.spec.ts.
test.describe("v2 editor - the caret stays on the text while typing", () => {
  test("a long typing burst never separates the caret from the glyphs", async ({
    page,
  }) => {
    await openV2(page, MUSHROOM_PDF);
    const run = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /^Spore Stage$/ })
      .first();
    if ((await run.count()) === 0) {
      test.skip(true, "fixture is missing the Spore Stage heading");
      return;
    }
    const testId = (await run.getAttribute("data-testid")) ?? "";
    await run.click();
    await page.waitForTimeout(300);
    await page.keyboard.press("End");
    await page.waitForTimeout(400);

    // Sampled DURING the burst, never after it: the point is that the caret
    // tracks the page's own glyphs while the user is still typing. Each
    // checkpoint takes the BEST of a few instantaneous reads: on a loaded
    // runner a single read can catch the caret one raster behind (a
    // glyph-width of transient lead), while the drift this guards against -
    // stale pen positions - survives every refresh, so its gap never drops.
    const gaps: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.type("b", { delay: 0 });
      await page.waitForTimeout(60);
      if (i === 9 || i === 19 || i === 29) {
        let best = Number.POSITIVE_INFINITY;
        for (let poll = 0; poll < 6; poll += 1) {
          const seen = await caretVersusGlyphs(page, testId);
          expect(seen, "should be able to measure the caret").not.toBeNull();
          best = Math.min(best, Math.abs(seen!.gap));
          if (best < 4) break;
          await page.waitForTimeout(50);
        }
        gaps.push(best);
      }
    }
    // The gap used to GROW with every keystroke - 7px, 14px, 21px here.
    for (const gap of gaps) {
      expect(
        gap,
        `caret sat ${gap.toFixed(1)}px off the text (gaps: ${gaps.map((g) => g.toFixed(1)).join(", ")})`,
      ).toBeLessThan(4);
    }

    // And it must not have been quietly accumulating: after the burst the caret
    // is no further off than it was during it.
    await page.waitForTimeout(2500);
    const after = await caretVersusGlyphs(page, testId);
    expect(Math.abs(after!.gap)).toBeLessThan(4);
  });
});
