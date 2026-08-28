import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// The sidebar promises two distinct behaviours:
//
//   Grow - "Boxes widen to the right as you type (no wrapping)."
//   Wrap - "Boxes keep their width; extra text wraps onto new lines."
//
// Neither held. Measured on paragraph-sample.pdf before this spec existed:
//
//   grow / single-line  box 303 -> 551 then STOPS at the page edge; 2944px of
//                       typed text clipped and invisible; never wraps.
//   grow / paragraph    box 500 -> 551 then stops; 1851px clipped; on blur the
//                       box SHRINKS to 490 and the model never gains a line.
//   wrap / single-line  box GREW 303 -> 551 (it is supposed to keep its width);
//                       3209px clipped; on blur box drops to 286 with the text
//                       still long, and the model still has one line.
//   wrap / paragraph    identical to grow - the two modes were indistinguishable.
//
// The user reported it as "grow mode doesn't grow, it just forces word wrap but
// doesn't visually show it or change the cursor onto the new line until you
// click off, and clicking back on resets the box to the old small size even
// though there is now text overlapped on a new line".
//
// The rules this spec holds both modes to:
//   * the box does not change size between blurring and re-focusing,
//   * Grow widens to fit, clips nothing, and never adds a line,
//   * Wrap keeps its width and moves the overflow onto new lines WHILE typing.
//
// Wrap's overflow used to stay hidden even after the model had wrapped, because
// ReflowWrapCommand joined a wrap-created line with " " while the loader emits
// one "\n" per visual line. run.text then held fewer lines than the page had ink
// for, buildExactLines failed at the seam, and the box kept its pre-edit height
// with the stale blocks still painted. Every visual line now joins with "\n" and
// the wrap-owned ones are recorded in run.paragraphSoftStarts, so they stay
// re-flowable. Measured after: wrap/paragraph clipped 2073px -> 4px, box height
// 100 -> 148 (4 -> 6 lines) WHILE still focused, blocks 6 at one row each.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

const LONG =
  " and then a great deal more text was typed into this line so that it runs " +
  "far past the right hand edge of the box it started in";

// A heading's box is narrow, so the same string wraps it to a dozen lines and
// the run then genuinely covers the paragraph beneath it - which intercepts the
// click and tells us nothing about width. Enough to overflow, not to bury the
// page.
const LONG_SHORT = " and then rather more text than it started with";
const textFor = (which: "single" | "paragraph") =>
  which === "single" ? LONG_SHORT : LONG;

async function open(page: Page, mode: "grow" | "wrap"): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page
    .locator('[data-testid="v2-file-input"]')
    .setInputFiles(PARAGRAPH_PDF);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  if (mode === "wrap") {
    await page
      .getByTestId("v2-width-mode-control")
      .getByText("Wrap", { exact: true })
      .click();
    await page.waitForTimeout(500);
  }
}

interface Shape {
  boxW: number;
  clipped: number;
  modelLines: number;
  caretInBox: boolean | null;
}

function shapeOf(
  page: Page,
  testId: string,
  runId: string,
): Promise<Shape | null> {
  return page.evaluate(
    ({ id, rid }: { id: string; rid: string }) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const s = (
        window as unknown as {
          __v2_editor_store: {
            state: {
              pages: {
                runs: {
                  id: string;
                  text: string;
                  paragraphLineCount?: number;
                }[];
              }[];
            };
          };
        }
      ).__v2_editor_store;
      // A wrapped line is a SOFT break: run.text gains no "\n", only the
      // painted line count grows. Read it off the SNAPSHOT - the model TextRun
      // has no paragraphLineCount, only TextRun.snapshot() adds it, so reading
      // doc.loadedPages() silently yields 1 for everything.
      let lines = 0;
      for (const pg of s.state.pages) {
        const r = pg.runs.find((x) => x.id === rid);
        if (r) lines = r.paragraphLineCount ?? r.text.split("\n").length;
      }
      const sel = window.getSelection();
      let caretInBox: boolean | null = null;
      if (sel && sel.rangeCount > 0 && el.contains(sel.focusNode)) {
        const c = sel.getRangeAt(0).getBoundingClientRect();
        caretInBox = c.left <= box.right + 2 && c.left >= box.left - 2;
      }
      return {
        boxW: +box.width.toFixed(1),
        clipped: el.scrollWidth - el.clientWidth,
        modelLines: lines,
        caretInBox,
      };
    },
    { id: testId, rid: runId },
  );
}

async function pickRun(page: Page, which: "single" | "paragraph") {
  const re = which === "single" ? /Heading/ : /First line of the body/;
  const run = page
    .locator('[data-testid^="v2-run-p0-"]')
    .filter({ hasText: re })
    .first();
  if ((await run.count()) === 0) return null;
  const testId = (await run.getAttribute("data-testid")) ?? "";
  return { run, testId, runId: testId.replace("v2-run-", "") };
}

async function caretToEndAndType(page: Page, testId: string, text: string) {
  await page.evaluate((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    el.focus();
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, testId);
  await page.waitForTimeout(250);
  await page.keyboard.type(text, { delay: 10 });
  await page.waitForTimeout(1500);
}

for (const which of ["single", "paragraph"] as const) {
  test.describe(`v2 editor - Grow width mode (${which})`, () => {
    test("widens to fit and never hides what was typed", async ({ page }) => {
      test.setTimeout(180_000);
      await open(page, "grow");
      const found = await pickRun(page, which);
      if (!found) {
        test.skip(true, `fixture is missing a ${which} run`);
        return;
      }
      const { run, testId, runId } = found;
      await run.click();
      await page.waitForTimeout(400);
      const before = await shapeOf(page, testId, runId);
      expect(before).not.toBeNull();

      await caretToEndAndType(page, testId, textFor(which));
      const typed = await shapeOf(page, testId, runId);
      expect(typed).not.toBeNull();

      expect(
        typed!.boxW,
        `Grow did not widen: ${before!.boxW} -> ${typed!.boxW}`,
      ).toBeGreaterThan(before!.boxW + 1);
      expect(
        typed!.clipped,
        `${typed!.clipped}px of typed text is clipped out of sight`,
      ).toBeLessThanOrEqual(1);
      expect(typed!.caretInBox, "the caret left the box").not.toBe(false);
      expect(
        typed!.modelLines,
        "Grow must not wrap - the hint says 'no wrapping'",
      ).toBe(before!.modelLines);
    });

    test("Grow keeps the same size across blur and re-focus", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await open(page, "grow");
      const found = await pickRun(page, which);
      if (!found) {
        test.skip(true, `fixture is missing a ${which} run`);
        return;
      }
      const { run, testId, runId } = found;
      await run.click();
      await page.waitForTimeout(400);
      await caretToEndAndType(page, testId, textFor(which));
      const typed = await shapeOf(page, testId, runId);

      await page.getByTestId("v2-page-0").click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(3000);
      // Re-find rather than reuse the locator: a reflow can rebuild the run, so
      // click the text the way a user does instead of an id that may be stale.
      const again = await pickRun(page, which);
      expect(again, "the run vanished after blurring").not.toBeNull();
      await again!.run.click();
      await page.waitForTimeout(1200);
      const back = await shapeOf(page, again!.testId, again!.runId);
      expect(back).not.toBeNull();

      // The reported inconsistency: the box came back smaller than the text in it.
      expect(
        back!.clipped,
        `after re-focusing, ${back!.clipped}px of text is clipped`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(back!.boxW - typed!.boxW),
        `box jumped from ${typed!.boxW} to ${back!.boxW} across blur/re-focus`,
      ).toBeLessThan(12);
    });
  });

  test.describe(`v2 editor - Wrap width mode (${which})`, () => {
    test("keeps its width and moves the overflow onto new lines", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await open(page, "wrap");
      const found = await pickRun(page, which);
      if (!found) {
        test.skip(true, `fixture is missing a ${which} run`);
        return;
      }
      const { run, testId, runId } = found;
      await run.click();
      await page.waitForTimeout(400);
      const before = await shapeOf(page, testId, runId);
      expect(before).not.toBeNull();

      await caretToEndAndType(page, testId, textFor(which));
      const typed = await shapeOf(page, testId, runId);
      expect(typed).not.toBeNull();

      expect(
        typed!.boxW,
        `Wrap widened the box ${before!.boxW} -> ${typed!.boxW}; the hint says boxes keep their width`,
      ).toBeLessThan(before!.boxW + 12);
      // The headline fix: the overflow goes onto new lines AS THE USER TYPES.
      // It used to wait for blur, so the text sat invisible past the box edge
      // and the caret only dropped onto the new line once they clicked away.
      expect(
        typed!.modelLines,
        "Wrap must push the overflow onto new lines WHILE typing",
      ).toBeGreaterThan(before!.modelLines);
    });

    test("Wrap keeps the same size across blur and re-focus", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await open(page, "wrap");
      const found = await pickRun(page, which);
      if (!found) {
        test.skip(true, `fixture is missing a ${which} run`);
        return;
      }
      const { run, testId, runId } = found;
      await run.click();
      await page.waitForTimeout(400);
      await caretToEndAndType(page, testId, textFor(which));
      const typed = await shapeOf(page, testId, runId);

      await page.getByTestId("v2-page-0").click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(3000);
      // Re-find rather than reuse the locator: a reflow can rebuild the run, so
      // click the text the way a user does instead of an id that may be stale.
      const again = await pickRun(page, which);
      expect(again, "the run vanished after blurring").not.toBeNull();
      await again!.run.click();
      await page.waitForTimeout(1200);
      const back = await shapeOf(page, again!.testId, again!.runId);
      expect(back).not.toBeNull();

      // The reported inconsistency: the box came back a different size from the
      // one the user had been typing in.
      expect(
        Math.abs(back!.boxW - typed!.boxW),
        `box jumped from ${typed!.boxW} to ${back!.boxW} across blur/re-focus`,
      ).toBeLessThan(12);
      // The wrap survives the round trip rather than being undone on re-focus.
      expect(
        back!.modelLines,
        `re-focusing lost the wrap: ${typed!.modelLines} lines -> ${back!.modelLines}`,
      ).toBeGreaterThanOrEqual(typed!.modelLines);
    });
  });
}
