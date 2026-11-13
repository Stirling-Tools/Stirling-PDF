import { test, expect } from "@editor/tests/helpers/stub-test-base";
import path from "path";

// Selecting text set in an embedded or subset face left the font picker showing
// its "Font family" placeholder: the editor knew the run was NotoSubset and told
// the user nothing. Worse, the blank box reads as "no font", inviting a pick that
// substitutes Helvetica for a typeface the document already had.
//
// The picker must name the font it recognised, and must not offer it as a
// re-selectable option unless the real face is actually loadable.

const SUBSET_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/subset-font-sample.pdf",
);

async function openEditor(page: import("@playwright/test").Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(file);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
}

/** The first run on page 0 whose font is neither base-14 nor a device face. */
function embeddedRun(
  page: import("@playwright/test").Page,
): Promise<{ id: string; fontId: string } | null> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __editor_store: {
        state: { pages: { runs: { id: string; fontId: string }[] }[] };
      };
    };
    const runs = w.__editor_store.state.pages[0].runs;
    const hit = runs.find((r) => !/^(base14|device):/.test(r.fontId));
    return hit ? { id: hit.id, fontId: hit.fontId } : null;
  });
}

test.describe("PDF text editor - document font recognition", () => {
  test("names the document's own font instead of showing a blank picker", async ({
    page,
  }) => {
    await openEditor(page, SUBSET_PDF);

    const run = await embeddedRun(page);
    expect(run, "fixture should hold an embedded font run").toBeTruthy();
    // "pdf:<ptr>:<family>" - the part the user should actually be shown.
    const family = run!.fontId.slice(run!.fontId.lastIndexOf(":") + 1);

    await page.locator(`[data-testid="pdf-editor-run-${run!.id}"]`).click();
    await page.waitForTimeout(400);

    const picker = page.getByTestId("pdf-editor-font-family");
    await expect(picker).toBeVisible();
    await expect(
      picker,
      `picker hid the recognised font ${run!.fontId}, leaving the user guessing`,
    ).toHaveValue(new RegExp(family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  test("does not offer the unloadable document font as a pick", async ({
    page,
  }) => {
    await openEditor(page, SUBSET_PDF);

    const run = await embeddedRun(page);
    expect(run).toBeTruthy();
    const before = run!.fontId;
    const family = before.slice(before.lastIndexOf(":") + 1);

    await page.locator(`[data-testid="pdf-editor-run-${run!.id}"]`).click();
    await page.waitForTimeout(400);

    // The recognised face must be listed - that is the recognition - and the
    // entry must be inert, since we hold no bytes to actually re-emit with.
    await page.getByTestId("pdf-editor-font-family").click();
    await page.waitForTimeout(400);
    const entry = page
      .getByRole("option", { name: new RegExp(`^${family}$`) })
      .first();
    await expect(
      entry,
      `the recognised font ${family} was not listed at all`,
    ).toBeVisible();
    await expect(
      entry,
      `${family} was offered as a pick, but we hold no bytes for it`,
    ).toHaveAttribute("data-combobox-disabled", "true");

    await entry.click({ force: true });
    await page.waitForTimeout(1000);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    const after = await page.evaluate((rid) => {
      const w = window as unknown as {
        __editor_store: {
          state: { pages: { runs: { id: string; fontId: string }[] }[] };
        };
      };
      for (const p of w.__editor_store.state.pages) {
        const r = p.runs.find((x) => x.id === rid);
        if (r) return r.fontId;
      }
      return null;
    }, run!.id);
    expect(
      after,
      `picking the recognised font rewrote ${before} to ${after}`,
    ).toBe(before);
  });

  // Without the original installed, a character the subset lacks is drawn in the closest available face.
  test("draws a character the subset lacks in the closest face, and names it", async ({
    page,
  }) => {
    await openEditor(page, SUBSET_PDF);

    const run = await embeddedRun(page);
    expect(run).toBeTruthy();
    await page.locator(`[data-testid="pdf-editor-run-${run!.id}"]`).click();

    const note = page.getByText(/closest match available/);
    await expect(
      note,
      "no lookalike was found for the embedded subset",
    ).toBeVisible({ timeout: 30_000 });
    const face = /drawn in (.+), the closest match/.exec(
      (await note.textContent()) ?? "",
    )?.[1];
    expect(face, "the note did not name the face").toBeTruthy();

    await page.keyboard.press("ControlOrMeta+ArrowRight");
    await page.keyboard.type(" Q", { delay: 60 });
    await page.keyboard.press("Escape");

    await expect
      .poll(
        () =>
          page.evaluate((rid) => {
            const w = window as unknown as {
              __editor_store: {
                state: {
                  pages: { runs: { id: string; text: string }[] }[];
                };
              };
            };
            return w.__editor_store.state.pages
              .flatMap((p) => p.runs)
              .find((r) => r.id === rid)?.text;
          }, run!.id),
        { message: "the typed character was not kept" },
      )
      .toContain("Q");

    const drawnIn = await page.evaluate(async () => {
      const w = window as unknown as {
        __editor_store: {
          document: {
            docPtr: number;
            module: {
              FPDF_GetPageCount: (doc: number) => number;
              FPDF_LoadPage: (doc: number, index: number) => number;
              FPDF_ClosePage: (page: number) => void;
              FPDFPage_CountObjects: (page: number) => number;
              FPDFPage_GetObject: (page: number, index: number) => number;
              FPDFPageObj_GetType: (obj: number) => number;
              FPDFTextObj_GetFont: (obj: number) => number;
              FPDFFont_GetBaseFontName: (
                font: number,
                buffer: number,
                length: number,
              ) => number;
              pdfium: {
                wasmExports: {
                  malloc: (size: number) => number;
                  free: (at: number) => void;
                };
                UTF8ToString: (at: number) => string;
              };
            };
            page: (index: number) => { pagePtr: number };
          };
        };
      };
      const doc = w.__editor_store.document;
      const m = doc.module;
      const pagePtr = doc.page(0).pagePtr;
      const names = new Set<string>();
      for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
        const obj = m.FPDFPage_GetObject(pagePtr, i);
        if (m.FPDFPageObj_GetType(obj) !== 1) continue;
        const font = m.FPDFTextObj_GetFont(obj);
        const length = m.FPDFFont_GetBaseFontName(font, 0, 0);
        const buffer = m.pdfium.wasmExports.malloc(length);
        m.FPDFFont_GetBaseFontName(font, buffer, length);
        names.add(m.pdfium.UTF8ToString(buffer));
        m.pdfium.wasmExports.free(buffer);
      }
      return [...names];
    });
    const squashed = (name: string) => name.replace(/[^a-z0-9]/gi, "");
    expect(
      drawnIn.map(squashed),
      `the typed character was not drawn in ${face}`,
    ).toContain(squashed(face!));
  });
});
