import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Blur reflows an edited paragraph back to its locked width. Rebuilding the
// lines used ONE median space width for the whole paragraph - but justified
// text stretches its spaces line by line, so every line that had been set
// tighter than the median came out wider than it was authored and dropped its
// last word onto a line of its own.
//
// Typing eleven characters at the end of one line of the three-line Sample.pdf
// paragraph turned it into six lines: "...carry out various" lost "various",
// and the line below lost its tail too - on lines the user never touched. The
// reported symptom was "I type, and when I click off, text teleports to a new
// line below it".
//
// The gap that followed each word in the document is right there in the glyph
// positions; only a pair the reflow is genuinely joining for the first time
// needs an estimate.

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

interface RunView {
  id: string;
  lineCount: number;
  height: number;
  text: string;
}

interface StoreView {
  state: {
    pages: {
      runs: {
        id: string;
        text: string;
        paragraphLineCount?: number;
        bounds: { height: number };
      }[];
    }[];
  };
}

function readRun(page: Page, id?: string): Promise<RunView | null> {
  return page.evaluate((rid: string | undefined) => {
    const s = (window as unknown as { __v2_editor_store: StoreView })
      .__v2_editor_store;
    for (const p of s.state.pages) {
      for (const r of p.runs) {
        const match = rid
          ? r.id === rid
          : /Stirling\s+PDF\s+is\s+a\s+robust/.test(r.text);
        if (match) {
          return {
            id: r.id,
            lineCount: r.paragraphLineCount ?? 1,
            height: r.bounds.height,
            text: r.text,
          };
        }
      }
    }
    return null;
  }, id);
}

test.describe("v2 editor - reflow keeps the lines it did not touch", () => {
  test("a short edit adds one line, not three", async ({ page }) => {
    await open(page);

    const before = await readRun(page);
    expect(before, "fixture paragraph not found").not.toBeNull();
    expect(
      before!.lineCount,
      "fixture should be the three-line justified paragraph",
    ).toBe(3);

    const testId = `v2-run-${before!.id}`;
    const run = page.locator(`[data-testid="${testId}"]`);
    await run.click();
    await page.waitForTimeout(400);
    // End of the FIRST visual line, so the edit has to wrap and the lines
    // below it are the ones that must survive untouched.
    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    await page.keyboard.type(" HELLOWORLD", { delay: 60 });
    await page.waitForTimeout(800);

    // Click away, the way the user does - blur is what runs the reflow.
    await page.getByTestId("v2-page-1").click({ position: { x: 6, y: 6 } });
    await page.waitForTimeout(3000);

    const after = await readRun(page, before!.id);
    expect(after).not.toBeNull();
    // One wrapped line for the typed text. The bug turned three lines into
    // six, because each line lost its last word as well.
    expect(
      after!.lineCount,
      `an 11-character edit took the paragraph from ${before!.lineCount} lines to ${after!.lineCount}`,
    ).toBeLessThanOrEqual(before!.lineCount + 1);
  });

  test("words on untouched lines stay on their own line", async ({ page }) => {
    await open(page);
    const before = await readRun(page);
    expect(before).not.toBeNull();

    const testId = `v2-run-${before!.id}`;
    await page.locator(`[data-testid="${testId}"]`).click();
    await page.waitForTimeout(400);
    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    await page.keyboard.type(" HELLOWORLD", { delay: 60 });
    await page.waitForTimeout(800);
    await page.getByTestId("v2-page-1").click({ position: { x: 6, y: 6 } });
    await page.waitForTimeout(3000);

    // The last line was never edited and had slack to spare, so a reflow that
    // respects the document's own spacing leaves it exactly as it was.
    const after = await readRun(page, before!.id);
    expect(after).not.toBeNull();
    expect(
      after!.text.includes("rotating, compressing, and more."),
      `the untouched closing line was re-broken: ${JSON.stringify(after!.text.slice(-80))}`,
    ).toBe(true);
  });
});
