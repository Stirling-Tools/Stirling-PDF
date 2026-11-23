import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import { selectWrapWidthMode } from "@editor/tests/stubbed/widthModeHelpers";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";

// Typing on past the right edge of a box has to break the line on the
// keystroke that crosses it, while the user keeps typing: text never slides
// sideways inside the box, never hides past its edge, and the caret follows
// the letters onto the new line without jumping back.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

const TYPED =
  " and this sentence keeps going far beyond the right edge of the page so " +
  "that it has to wrap onto new lines and keep going";

interface Frame {
  inputs: number;
  domLetters: string;
  model: string;
  domLines: number;
  caretAtEnd: boolean;
  caret: { x: number; y: number } | null;
  glyphRight: number | null;
  glyphChar: string | null;
  boxRight: number;
  boxBottom: number;
  pageRight: number;
  scrolled: number;
}

interface EditorWindow {
  __editor_store: {
    state: { pages: { runs: { id: string; text: string }[] }[] };
  };
  __liveWrapFrames: Frame[];
}

async function open(page: Page, mode: "grow" | "wrap"): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openInTextEditor(page, PARAGRAPH_PDF);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  if (mode === "wrap") await selectWrapWidthMode(page);
}

async function focusEndOfHeading(page: Page): Promise<string> {
  const heading = page
    .locator('[data-testid^="pdf-editor-run-"]')
    .filter({ hasText: /^Heading/ })
    .first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await heading.click();
  await expect(heading).toBeFocused();
  const testId = (await heading.getAttribute("data-testid")) ?? "";
  await page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const selection = window.getSelection()!;
    selection.selectAllChildren(el);
    selection.collapseToEnd();
  }, testId);
  return testId;
}

/** Records, on the frame after every input, what the user sees in the box. */
function recordFrames(page: Page, testId: string): Promise<void> {
  return page.evaluate((id) => {
    const w = window as unknown as EditorWindow;
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const runId = el.dataset.runId;
    const frames: Frame[] = [];
    w.__liveWrapFrames = frames;
    let inputs = 0;
    const lineCount = () => el.innerText.replace(/\n$/, "").split("\n").length;
    el.addEventListener("input", () => {
      inputs += 1;
      const n = inputs;
      requestAnimationFrame(() => {
        // A key handled before this frame was drawn makes it that key's frame:
        // the user never saw this one. Engines differ in how often that is.
        if (n !== inputs) return;
        const selection = window.getSelection()!;
        const box = el.getBoundingClientRect();
        let caret: Frame["caret"] = null;
        let glyphRight: number | null = null;
        let glyphChar: string | null = null;
        let caretAtEnd = false;
        if (selection.rangeCount && el.contains(selection.focusNode)) {
          const at = selection.getRangeAt(0).cloneRange();
          at.collapse(false);
          const rects = at.getClientRects();
          const r = rects.length ? rects[0] : at.getBoundingClientRect();
          caret = { x: r.x, y: r.y };
          const rest = document.createRange();
          rest.setStart(at.endContainer, at.endOffset);
          rest.setEnd(el, el.childNodes.length);
          caretAtEnd = rest.toString() === "";
          const node = selection.focusNode!;
          const offset = selection.focusOffset;
          if (node.nodeType === Node.TEXT_NODE && offset > 0) {
            const glyph = document.createRange();
            glyph.setStart(node, offset - 1);
            glyph.setEnd(node, offset);
            glyphRight = glyph.getBoundingClientRect().right;
            glyphChar = (node.textContent ?? "")[offset - 1];
          }
        }
        const run = w.__editor_store.state.pages
          .flatMap((p) => p.runs)
          .find((r) => r.id === runId);
        frames.push({
          inputs: n,
          domLetters: (el.textContent ?? "").replace(/\s/g, ""),
          model: run?.text ?? "",
          domLines: lineCount(),
          caretAtEnd,
          caret,
          glyphRight,
          glyphChar,
          boxRight: box.right,
          boxBottom: box.bottom,
          pageRight: el
            .closest("[data-testid^='pdf-editor-page-']")!
            .getBoundingClientRect().right,
          scrolled: el.scrollLeft + el.scrollTop,
        });
      });
    });
  }, testId);
}

// Holds the main thread for `frameMs` of every frame, as a slow machine does,
// so the engine's re-measure lands several keystrokes after the letters it
// measures.
function slowFrames(page: Page, frameMs: number): Promise<void> {
  return page.evaluate((ms) => {
    const busy = () => {
      const until = performance.now() + ms;
      while (performance.now() < until);
      requestAnimationFrame(busy);
    };
    requestAnimationFrame(busy);
  }, frameMs);
}

async function typeAndRecord(
  page: Page,
  mode: "grow" | "wrap",
  delay: number,
  frameMs: number,
): Promise<{ frames: Frame[]; startText: string; fontPx: number }> {
  await open(page, mode);
  const testId = await focusEndOfHeading(page);
  const box = page.getByTestId(testId);
  const startText = (await box.innerText()).replace(/\n$/, "");
  const fontPx = parseFloat(
    await box.evaluate((el) => getComputedStyle(el).fontSize),
  );
  await recordFrames(page, testId);
  if (frameMs > 0) await slowFrames(page, frameMs);
  await page.keyboard.type(TYPED, { delay });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as EditorWindow).__liveWrapFrames.at(-1)
              ?.inputs ?? 0,
        ),
      { timeout: 30_000 },
    )
    .toBe(TYPED.length);
  const frames = await page.evaluate(
    () => (window as unknown as EditorWindow).__liveWrapFrames,
  );
  return { frames, startText, fontPx };
}

function check(
  frames: Frame[],
  startText: string,
  fontPx: number,
  mode: "grow" | "wrap",
): void {
  const flat = (s: string) => s.replace(/\s+/g, " ");
  const startLines = startText.split("\n").length;
  // The box draws the PDF's advances only once the engine has re-measured the
  // typed letters; until then they sit on the browser's, which can run a few
  // pixels wider than the PDF's, so for the key before the PDF wraps the box
  // can widen that far past its edge to show them.
  const slack = fontPx * 0.5;
  let crossedAt: Frame | null = null;
  let brokeAt: Frame | null = null;
  let previousCaret: Frame["caret"] = null;
  for (const f of frames) {
    const typed = startText + TYPED.slice(0, f.inputs);
    const where = `after key ${f.inputs} (${JSON.stringify(TYPED[f.inputs - 1])})`;
    expect(f.domLetters, `box text ${where}`).toBe(typed.replace(/\s/g, ""));
    expect(flat(f.model), `model text ${where}`).toBe(flat(typed));
    expect(f.caretAtEnd, `caret at the end of the text ${where}`).toBe(true);
    expect(f.scrolled, `box scrolled sideways ${where}`).toBe(0);
    const edge = mode === "grow" ? f.pageRight : frames[0].boxRight;
    expect(f.boxRight, `box widened past its edge ${where}`).toBeLessThan(
      edge + slack,
    );
    const letter = f.glyphChar !== null && f.glyphChar.trim() !== "";
    if (letter && f.glyphRight !== null) {
      if (!crossedAt && f.glyphRight > f.boxRight + 0.5) crossedAt = f;
      expect(f.glyphRight, `last letter past the box ${where}`).toBeLessThan(
        f.boxRight + slack,
      );
      expect(f.caret!.x, `caret past the box ${where}`).toBeLessThan(
        f.boxRight + slack,
      );
    }
    if (f.caret) {
      expect(f.caret.y, `caret below the box ${where}`).toBeLessThan(
        f.boxBottom,
      );
      if (previousCaret) {
        const sameLine = Math.abs(f.caret.y - previousCaret.y) <= 2;
        const forward = sameLine
          ? f.caret.x >= previousCaret.x - 1
          : f.caret.y > previousCaret.y;
        expect(
          forward,
          `caret moved backwards ${where}: ${JSON.stringify(previousCaret)} -> ${JSON.stringify(f.caret)}`,
        ).toBe(true);
      }
      previousCaret = f.caret;
    }
    if (!brokeAt && f.domLines > startLines) brokeAt = f;
  }
  expect(brokeAt, "the line never broke while typing").not.toBeNull();
  const crossing =
    crossedAt && crossedAt.inputs < brokeAt!.inputs ? crossedAt : brokeAt!;
  // Counted in drawn frames, not keys: a key that lands before its frame is
  // drawn leaves no frame for the user to see the line unbroken in.
  expect(
    frames.filter(
      (f) => f.inputs > crossing.inputs && f.inputs < brokeAt!.inputs,
    ).length,
    "frames drawn between crossing the edge and the line break",
  ).toBe(0);
}

test.describe("Typing past the box edge wraps on the crossing keystroke", () => {
  test.setTimeout(120_000);
  const paces = [
    { delay: 25, frameMs: 0 },
    { delay: 90, frameMs: 0 },
    { delay: 25, frameMs: 28 },
  ];
  for (const mode of ["grow", "wrap"] as const) {
    for (const { delay, frameMs } of paces) {
      const pace = frameMs ? `, ${frameMs}ms frames` : "";
      test(`${mode}, ${delay}ms per key${pace}`, async ({ page }) => {
        const { frames, startText, fontPx } = await typeAndRecord(
          page,
          mode,
          delay,
          frameMs,
        );
        check(frames, startText, fontPx, mode);
      });
    }
  }
});
