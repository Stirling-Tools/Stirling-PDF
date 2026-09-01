import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Wrap never happened. On blur the overlay asked ReflowWrapCommand to wrap at
// `width / scale`, but with an exact layout `width` is the width the BOX had
// grown to while the user typed - so the command's own overflow check
// ("does any line stick out past maxWidth?") was always false and it returned
// without moving a glyph. The box just kept getting wider.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

const LONG_TEXT =
  " and then a great deal more text was typed into this line so that it " +
  "runs far past the right hand edge of the box it started in";

async function openV2(page: import("@playwright/test").Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

/**
 * Open in WRAP mode, which is the mode every test in this file is about.
 *
 * They used to rely on the default (Grow) wrapping a paragraph anyway, because
 * `wantWrap` was `wrapMode || isParagraph`. That made the two modes identical
 * for body text and contradicted Grow's own hint ("Boxes widen to the right as
 * you type (no wrapping)"), so Grow now genuinely grows and these have to ask
 * for the mode they are testing.
 */
async function openWrapMode(
  page: import("@playwright/test").Page,
  file: string,
) {
  await openV2(page, file);
  await page.getByTestId("v2-tab-document").click();
  await page.getByTestId("v2-advanced-toggle").click();
  await page
    .getByTestId("v2-width-mode-control")
    .getByText("Wrap", { exact: true })
    .click();
  await page.getByTestId("v2-tab-selected").click();
  await page.waitForTimeout(400);
}

interface RunShape {
  width: number;
  /** Painted line count. Wrapped lines are SOFT breaks, so run.text does not
   * gain a "\n" and only this grows. */
  lines: number;
  text: string;
}

function readRun(
  page: import("@playwright/test").Page,
  runId: string,
): Promise<RunShape | null> {
  return page.evaluate((rid) => {
    const w = window as unknown as {
      __v2_editor_store: {
        state: {
          pages: {
            runs: {
              id: string;
              text: string;
              bounds: { width: number };
              paragraphLineCount?: number;
            }[];
          }[];
        };
      };
    };
    for (const p of w.__v2_editor_store.state.pages) {
      const r = p.runs.find((x) => x.id === rid);
      if (r) {
        return {
          width: r.bounds.width,
          lines: r.paragraphLineCount ?? r.text.split("\n").length,
          text: r.text,
        };
      }
    }
    return null;
  }, runId);
}

/** Focus a run, put the caret at the very end, and type. */
async function typeAtEnd(
  page: import("@playwright/test").Page,
  testId: string,
  text: string,
) {
  await page.evaluate((id) => {
    const el = document.querySelector<HTMLDivElement>(`[data-testid="${id}"]`);
    if (!el) throw new Error(`no run ${id}`);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, testId);
  await page.waitForTimeout(300);
  await page.keyboard.type(text, { delay: 8 });
  await page.waitForTimeout(1200);
}

/** Blur the run, which is what triggers the wrap reflow. */
async function blurRun(page: import("@playwright/test").Page, testId: string) {
  await page.evaluate((id) => {
    document.querySelector<HTMLDivElement>(`[data-testid="${id}"]`)?.blur();
  }, testId);
  await page.waitForTimeout(2500);
}

test.describe("v2 editor - text wrap", () => {
  test("a paragraph reflows instead of growing off the page", async ({
    page,
  }) => {
    await openWrapMode(page, PARAGRAPH_PDF);
    const run = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /First line of the body/ })
      .first();
    const testId = (await run.getAttribute("data-testid")) ?? "";
    const runId = testId.replace("v2-run-", "");
    await run.click();
    await page.waitForTimeout(300);

    const before = await readRun(page, runId);
    expect(before, "fixture paragraph should be in the model").not.toBeNull();
    expect(before!.lines, "fixture should be multi-line").toBeGreaterThan(1);

    await typeAtEnd(page, testId, LONG_TEXT);
    await blurRun(page, testId);

    const after = await readRun(page, runId);
    expect(after).not.toBeNull();
    // The whole point of wrapping: the box keeps the width it was locked to
    // and the overflow goes onto new lines.
    expect(
      after!.width,
      `box grew from ${before!.width.toFixed(0)}pt to ${after!.width.toFixed(0)}pt instead of wrapping back to its locked width`,
    ).toBeLessThan(before!.width + 1);
    expect(
      after!.lines,
      "the added text should have pushed onto new lines",
    ).toBeGreaterThan(before!.lines);
  });

  test("wrap mode keeps a single-line run inside its box", async ({ page }) => {
    await openV2(page, PARAGRAPH_PDF);

    // Wrap mode is a document-level preference, in the panel's overflow menu.
    await page.getByTestId("v2-tab-document").click();
    await page.getByTestId("v2-advanced-toggle").click();
    await page
      .getByTestId("v2-width-mode-control")
      .getByText("Wrap", { exact: true })
      .click();
    await page.getByTestId("v2-tab-selected").click();
    await page.waitForTimeout(400);

    const run = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /Heading/ })
      .first();
    if ((await run.count()) === 0) {
      test.skip(true, "fixture is missing a single-line heading");
      return;
    }
    const testId = (await run.getAttribute("data-testid")) ?? "";
    const runId = testId.replace("v2-run-", "");
    await run.click();
    await page.waitForTimeout(300);

    const before = await readRun(page, runId);
    expect(before).not.toBeNull();
    expect(before!.lines, "should start as one line").toBe(1);

    await typeAtEnd(page, testId, LONG_TEXT);
    await blurRun(page, testId);

    const after = await readRun(page, runId);
    expect(after).not.toBeNull();
    expect(
      after!.lines,
      "in wrap mode the overflow must go onto a second line",
    ).toBeGreaterThan(1);
    // Wrapping at the page edge is not wrapping: "Wrap" means the run keeps
    // the box it had. The old code reflowed at whatever width the box had
    // grown to, so the heading spanned the page before it broke at all.
    expect(
      after!.width,
      `wrap mode let the box grow from ${before!.width.toFixed(0)}pt to ${after!.width.toFixed(0)}pt`,
    ).toBeLessThan(before!.width + 1);
  });

  // This used to assert that the overlay WRAPS text typed past the page edge.
  // It does not any more, and must not: a painted line block is one PDF text
  // object at one pen origin, and the page cannot wrap it. Wrapping in the
  // overlay put a long line on two rows there and one row on the page, which
  // pushed every line below it a full line-height out of register - the box
  // overhung its own text and the rendered text appeared stuck on the previous
  // line. See pdf-text-editor-v2-newline-register.spec.ts.
  //
  // What has to hold instead is that the text is not LOST: the reflow on blur
  // brings an over-long line back onto the page.
  test("text typed past the page edge is brought back on-page by the reflow", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openWrapMode(page, PARAGRAPH_PDF);
    const run = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /First line of the body/ })
      .first();
    const testId = (await run.getAttribute("data-testid")) ?? "";
    const runId = testId.replace("v2-run-", "");
    await run.click();
    await page.waitForTimeout(300);
    const before = await readRun(page, runId);
    expect(before).not.toBeNull();

    // Enough to push the box well past its page-edge cap.
    await typeAtEnd(page, testId, LONG_TEXT + LONG_TEXT + LONG_TEXT);

    // While typing the overlay must still describe the page: one painted block
    // per model line, none of them wrapped onto extra rows.
    const rows = await page.evaluate((id: string) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) return null;
      return [...el.querySelectorAll<HTMLElement>("[data-v2-line]")].map((b) =>
        Math.round(
          b.getBoundingClientRect().height /
            parseFloat(getComputedStyle(b).lineHeight),
        ),
      );
    }, testId);
    expect(
      rows,
      "the run should still be painted in line blocks",
    ).not.toBeNull();
    expect(
      rows,
      `a painted line wrapped onto extra rows: ${JSON.stringify(rows)}`,
    ).toEqual(rows!.map(() => 1));

    await blurRun(page, testId);
    const after = await readRun(page, runId);
    expect(after).not.toBeNull();
    // The typed text survived and was re-broken onto lines that fit.
    expect(after!.lines, "the reflow should have added lines").toBeGreaterThan(
      before!.lines,
    );
  });
});
