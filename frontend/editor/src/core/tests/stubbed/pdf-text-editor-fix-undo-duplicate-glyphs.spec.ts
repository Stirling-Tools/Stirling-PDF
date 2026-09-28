import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Undoing a mid-word edit used to leave the edited glyphs on the page next to
// the restored ones. Typing "QQ" into "Heading in a bigger size" and pressing
// undo once gave a page reading "Heading in a Qbigger bigger sizesize" - the
// overlapping pairs are what makes undo look like it changed the font or
// mangled particular characters.
//
// Cause: a typed burst coalesces into ONE undo step spanning several commands.
// The first revert removed its own createdPtrs and re-emitted the run; the
// second then found ITS createdPtrs already gone, removed nothing, and
// re-emitted again, orphaning the first revert's objects on the page.
//
// The assertions are on the PDF's own extracted text and its object count, not
// on the model, because the model reverted correctly the whole time - it was
// the page that held two copies.

const PARAGRAPH = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

interface DocWindow {
  __editor_store: {
    doc: {
      module: {
        FPDFPage_CountObjects: (p: number) => number;
        FPDFText_LoadPage: (p: number) => number;
        FPDFText_ClosePage: (tp: number) => void;
        FPDFText_CountChars: (tp: number) => number;
        FPDFText_GetUnicode: (tp: number, i: number) => number;
      };
      loadedPages: () => { pagePtr: number }[];
    };
    state: { pages: { runs: { fontId: string }[] }[] };
  };
}

/** The page's own extracted text - a duplicated glyph run shows up as repeats. */
async function pageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const s = (window as unknown as DocWindow).__editor_store;
    const pg = s.doc.loadedPages()[0];
    if (!pg) return "";
    const m = s.doc.module;
    const tp = m.FPDFText_LoadPage(pg.pagePtr);
    let out = "";
    const n = m.FPDFText_CountChars(tp);
    for (let i = 0; i < n; i++) {
      const c = m.FPDFText_GetUnicode(tp, i);
      if (c) out += String.fromCharCode(c);
    }
    m.FPDFText_ClosePage(tp);
    return out;
  });
}

async function objectCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const s = (window as unknown as DocWindow).__editor_store;
    const pg = s.doc.loadedPages()[0];
    return pg ? s.doc.module.FPDFPage_CountObjects(pg.pagePtr) : -1;
  });
}

async function firstRunFont(page: Page): Promise<string> {
  return page.evaluate(() => {
    const s = (window as unknown as DocWindow).__editor_store;
    return s.state.pages[0]?.runs[0]?.fontId ?? "<none>";
  });
}

async function open(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(PARAGRAPH);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(2500);
}

async function undoAll(page: Page): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    const can = await page
      .getByTestId("pdf-editor-undo")
      .isEnabled()
      .catch(() => false);
    if (!can) break;
    await page.getByTestId("pdf-editor-undo").click();
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1500);
}

const CASES = [
  { label: "typing mid-word", mode: "mid" as const },
  { label: "backspacing at the end", mode: "backspace" as const },
];

for (const c of CASES) {
  test(`undo after ${c.label} leaves one copy of the text, not two`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await open(page);

    const textBefore = await pageText(page);
    const objectsBefore = await objectCount(page);
    const fontBefore = await firstRunFont(page);
    expect(textBefore.length, "fixture produced no text").toBeGreaterThan(50);

    const run = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
    await run.click();
    await page.waitForTimeout(400);
    if (c.mode === "backspace") {
      await page.keyboard.press("End");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
    } else {
      // The click leaves the caret inside the word, so this splits the run.
      await page.keyboard.type("QQ", { delay: 40 });
    }
    await page.waitForTimeout(1200);
    await page
      .locator('[data-testid="pdf-editor-page-0"]')
      .click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(1500);

    const objectsEdited = await objectCount(page);
    await undoAll(page);

    const textAfter = await pageText(page);
    const objectsAfter = await objectCount(page);
    const fontAfter = await firstRunFont(page);

    // eslint-disable-next-line no-console
    console.log(
      `UNDODUP ${c.label}: objects ${objectsBefore}->${objectsEdited}->${objectsAfter} ` +
        `chars ${textBefore.length}->${textAfter.length} font ${fontBefore} -> ${fontAfter}`,
    );

    // Same characters, same count. Undo used to add 12 (a doubled "bigger" and
    // "size") and a surviving "Q".
    expect(
      textAfter.length,
      `undo changed the page's character count (was ${textBefore.length}, now ${textAfter.length}): "${textAfter.slice(-60)}"`,
    ).toBe(textBefore.length);
    expect(
      [...textAfter].sort().join(""),
      "undo left different characters on the page",
    ).toBe([...textBefore].sort().join(""));

    // Undo must not ADD objects. It used to go 5 -> 9 -> 14.
    expect(
      objectsAfter,
      `undo grew the page from ${objectsEdited} objects to ${objectsAfter}`,
    ).toBeLessThanOrEqual(objectsEdited);

    // The run keeps its embedded face; the revert used to re-emit as base-14.
    expect(fontAfter, "undo swapped the run onto a fallback font").toBe(
      fontBefore,
    );
  });
}
