import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// The editable overlay has to stay in register with the page bitmap, line for
// line. A painted line block IS one line of the PDF - one text object at one
// pen origin - and the page has no such thing as a soft break.
//
// The blocks were changed to `min-height` and `white-space: inherit`, so when
// the container flipped to `pre-wrap` (which it did merely by growing to the
// page-edge cap) a long line took TWO rows in the overlay and one on the page.
// Every block below it was pushed a full line-height down while the ink stayed
// put: the box overhung its own text by a row, overlapping what sat beneath it,
// and the last line's rendered text appeared to be stuck on the previous line.
// Measured on Sample.pdf at the time: box 163.8px tall over 131.7px of rendered
// text, a 30.9px offset against a 32.1px line-height - exactly one line.
//
// The user reported it as "new lines can make the text invisible, text overlaps
// the textbox but rendered text stays on previous line".

// Long enough to drive the box hard into its page-edge cap, which is what
// flipped the container to pre-wrap and took the painted blocks with it.
const LONG_LINE =
  "the quick brown fox jumps over the lazy dog and keeps running well past the right hand edge of the page and then some more words after that too";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../public/samples/Sample.pdf",
);

async function open(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-1")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

interface StoreView {
  state: { pages: { runs: { id: string; text: string }[] }[] };
}

async function findRun(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const s = (window as unknown as { __v2_editor_store: StoreView })
      .__v2_editor_store;
    for (const p of s.state.pages) {
      for (const r of p.runs) {
        if (/Stirling\s+PDF\s+is\s+a\s+robust/.test(r.text)) return r.id;
      }
    }
    return "";
  });
  expect(id, "fixture paragraph not found").not.toBe("");
  return id;
}

/** Rows each painted line block occupies, and the block/model line counts. */
function register(page: Page, runId: string) {
  return page.evaluate((rid: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-testid="v2-run-${rid}"]`,
    );
    if (!el) return null;
    const blocks = [...el.querySelectorAll<HTMLElement>("[data-v2-line]")];
    const rows = blocks.map((b) => {
      const lh = parseFloat(getComputedStyle(b).lineHeight);
      return lh > 0 ? Math.round(b.getBoundingClientRect().height / lh) : 1;
    });
    const s = (
      window as unknown as {
        __v2_editor_store: {
          state: { pages: { runs: { id: string; text: string }[] }[] };
        };
      }
    ).__v2_editor_store;
    let modelLines = 0;
    for (const p of s.state.pages) {
      const r = p.runs.find((x) => x.id === rid);
      if (r) modelLines = r.text.split("\n").length;
    }
    return {
      rows,
      blocks: blocks.length,
      modelLines,
      blockWhiteSpace: blocks.map((b) => getComputedStyle(b).whiteSpace),
      boxHeight: +el.getBoundingClientRect().height.toFixed(1),
      contentHeight: +blocks
        .reduce((n, b) => n + b.getBoundingClientRect().height, 0)
        .toFixed(1),
    };
  }, runId);
}

test.describe("v2 editor - the overlay stays in register with the page", () => {
  test("a painted line never occupies more than one row", async ({ page }) => {
    await open(page);
    const runId = await findRun(page);
    const run = page.locator(`[data-testid="v2-run-${runId}"]`);
    await run.click();
    await page.waitForTimeout(400);

    // Enter, then a line long enough to reach the page-edge cap - which is what
    // used to flip the container to pre-wrap and take the blocks with it.
    await page.keyboard.press("End");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    await page.keyboard.type(LONG_LINE, { delay: 12 });
    await page.waitForTimeout(1500);

    const reg = await register(page, runId);
    expect(reg, "run vanished").not.toBeNull();
    // Guard: with no painted blocks the row assertion below is vacuous.
    expect(
      reg!.blocks,
      "the run should be painted as line blocks, not plain text",
    ).toBeGreaterThan(1);
    expect(
      reg!.blockWhiteSpace.every((w) => w === "pre"),
      `a painted block was allowed to wrap: ${reg!.blockWhiteSpace.join(", ")}`,
    ).toBe(true);
    expect(
      reg!.rows,
      `a painted line took more than one row: ${JSON.stringify(reg!.rows)}`,
    ).toEqual(reg!.rows.map(() => 1));
  });

  test("the overlay shows exactly as many rows as the model has lines", async ({
    page,
  }) => {
    await open(page);
    const runId = await findRun(page);
    const run = page.locator(`[data-testid="v2-run-${runId}"]`);
    await run.click();
    await page.waitForTimeout(400);
    await page.keyboard.press("End");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    await page.keyboard.type(LONG_LINE, { delay: 12 });
    await page.waitForTimeout(1500);

    const reg = await register(page, runId);
    expect(reg).not.toBeNull();
    expect(reg!.blocks).toBeGreaterThan(1);
    // The register invariant: the page draws one row per model line, so the
    // overlay must show exactly that many. A block that wrapped added a row the
    // page has no counterpart for, and everything below it lost alignment.
    const totalRows = reg!.rows.reduce((n, r) => n + r, 0);
    expect(
      totalRows,
      `overlay shows ${totalRows} rows for ${reg!.modelLines} model lines (rows: ${JSON.stringify(reg!.rows)})`,
    ).toBe(reg!.modelLines);
  });
});
