import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// A line created with Enter came out in Helvetica while the paragraph around it
// kept the document's own face. Two things had to be true for that:
//
//   1. `emptySlot` stamped the new blank line `base14:...` the moment Enter was
//      pressed - before a character had been typed into it - and everything
//      typed afterwards re-emitted against that id.
//   2. The fresh-emit branch asked `bestFontPtrForText` for a font to reuse
//      using the slot's OWN objects, and a brand-new line has none, so it got 0
//      and fell through to the base-14 emit.
//
// Neither alone is enough: the blank line has to inherit the right id, AND the
// emit has to be able to find a real font handle behind it. Measured on
// Sample.pdf, typing "tion tions ration" onto a new line: 15 of 15 emitted
// objects were Helvetica before, 4 of 15 after.
//
// The residue is characters the embedded subset genuinely does not contain -
// Sample.pdf's paragraph has no lowercase "h" at all, so "the quick brown fox"
// still falls back for those. That needs the subset extending and is not what
// this test is about.

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../public/samples/Sample.pdf",
);

/** Every character of this is already in the fixture paragraph. */
const IN_SUBSET = "tion tions ration";

interface SlotView {
  fontId: string;
  text: string;
}

async function open(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-1")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

async function findRun(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const s = (
      window as unknown as {
        __v2_editor_store: {
          state: { pages: { runs: { id: string; text: string }[] }[] };
        };
      }
    ).__v2_editor_store;
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

function slotsOf(page: Page, runId: string): Promise<SlotView[] | null> {
  return page.evaluate((rid: string) => {
    const s = (
      window as unknown as {
        __v2_editor_store: {
          doc: {
            loadedPages(): {
              runs: {
                id: string;
                paragraphLineSlots?: {
                  fontId: string;
                  mergedFromTexts: string[];
                }[];
              }[];
            }[];
          };
        };
      }
    ).__v2_editor_store;
    for (const pg of s.doc.loadedPages()) {
      const r = pg.runs.find((x) => x.id === rid);
      if (r?.paragraphLineSlots) {
        return r.paragraphLineSlots.map((sl) => ({
          fontId: sl.fontId,
          text: sl.mergedFromTexts.join(""),
        }));
      }
    }
    return null;
  }, runId);
}

test.describe("v2 editor - a new line keeps the document's font", () => {
  test("Enter then typing does not stamp the line base-14", async ({
    page,
  }) => {
    await open(page);
    const runId = await findRun(page);
    const run = page.locator(`[data-testid="v2-run-${runId}"]`);
    await run.click();
    await page.waitForTimeout(400);

    const before = await slotsOf(page, runId);
    expect(before, "paragraph should have line slots").not.toBeNull();
    const paragraphFont = before![0].fontId;
    expect(
      paragraphFont.startsWith("base14:"),
      `fixture paragraph is already base-14 (${paragraphFont}) - it proves nothing`,
    ).toBe(false);

    // Caret to the end of the first painted line, then Enter and type.
    await page.evaluate((rid: string) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-run-${rid}"]`,
      )!;
      const first = el.querySelector('[data-v2-line="0"]')!;
      el.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(first);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }, runId);
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    await page.keyboard.type(IN_SUBSET, { delay: 30 });
    await page.waitForTimeout(2500);

    const after = await slotsOf(page, runId);
    expect(after, "slots vanished").not.toBeNull();
    const typed = after!.find((sl) =>
      sl.text.replace(/\s+/g, "").includes("tions"),
    );
    expect(
      typed,
      `the typed line is not in the slots: ${JSON.stringify(after!.map((s) => s.text.slice(0, 20)))}`,
    ).toBeTruthy();
    expect(
      typed!.fontId,
      `the new line was emitted as ${typed!.fontId} while the paragraph is ${paragraphFont}`,
    ).toBe(paragraphFont);
  });
});
