import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

/**
 * REGRESSION suite for the 12 issues found by the QA sweep of the v2 PDF text
 * editor - all since fixed. Each test asserts the desired behaviour and must
 * pass. They were previously `test.fail()` placeholders documenting the bugs;
 * the markers were removed as each fix landed.
 *
 * Scenarios are weighted to the shipped marketing Sample.pdf (Type3,
 * per-glyph fonts) because that is what users actually load.
 */
const SAMPLE = path.join(__dirname, "../../../../public/samples/Sample.pdf");
const SUBSET = path.join(__dirname, "../test-fixtures/subset-font-sample.pdf");

async function open(page: any, file: string, firstPage = 0): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId(`v2-page-${firstPage}`)).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
}
async function findId(
  page: any,
  pageIdx: number,
  src: string,
): Promise<string> {
  const id = await page.evaluate(
    ({ pageIdx, src }: { pageIdx: number; src: string }) => {
      const s = (window as any).__v2_editor_store;
      const r = s.doc
        .page(pageIdx)
        .runs.find((x: any) => new RegExp(src).test(x.text));
      return r ? r.id : null;
    },
    { pageIdx, src },
  );
  if (!id) throw new Error(`run /${src}/ not found on page ${pageIdx}`);
  return id;
}
async function leafPtrs(
  page: any,
  pageIdx: number,
  id: string,
): Promise<number[]> {
  return page.evaluate(
    ({ pageIdx, id }: { pageIdx: number; id: string }) => {
      const s = (window as any).__v2_editor_store;
      const r = s.doc.page(pageIdx).runs.find((x: any) => x.id === id);
      return r ? [...r.paragraphLeafPtrs] : [];
    },
    { pageIdx, id },
  );
}
async function caretEndInsert(
  page: any,
  id: string,
  text: string,
): Promise<void> {
  await page.evaluate(
    ({ id, text }: { id: string; text: string }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${id}"]`,
      )!;
      el.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
    },
    { id, text },
  );
  await page.waitForTimeout(150);
}
async function replaceAll(page: any, id: string, full: string): Promise<void> {
  await page.evaluate(
    ({ id, full }: { id: string; full: string }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${id}"]`,
      )!;
      el.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, full);
    },
    { id, full },
  );
  await page.waitForTimeout(200);
}
async function blur(page: any, id: string): Promise<void> {
  await page.evaluate((rid: string) => {
    document
      .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
      ?.blur();
  }, id);
  await page.waitForTimeout(1200);
}
/** Per-glyph geometry + extracted text for a run, straight from PDFium. */
async function glyphs(
  page: any,
  pageIdx: number,
  id: string,
): Promise<{
  boundsRight: number;
  pageWidth: number;
  fontId: string;
  text: string;
  maxGap: number;
  hasYdieresis: boolean;
}> {
  return page.evaluate(
    ({ pageIdx, id }: { pageIdx: number; id: string }) => {
      const s = (window as any).__v2_editor_store;
      const m = s.doc.module;
      const pg = s.doc.page(pageIdx);
      pg.flushGenerate(m);
      const r = pg.runs.find((x: any) => x.id === id);
      const ptrs: number[] = r.paragraphLeafPtrs.length
        ? r.paragraphLeafPtrs
        : r.mergedFromPtrs.length
          ? r.mergedFromPtrs
          : [r.pdfiumObjPtr];
      const tp = m.FPDFText_LoadPage(pg.pagePtr);
      const seg: Array<{ x: number; right: number; base: number }> = [];
      let hasY = false;
      try {
        for (const ptr of ptrs) {
          if (!ptr) continue;
          const l = m.pdfium.wasmExports.malloc(4);
          const b = m.pdfium.wasmExports.malloc(4);
          const rr = m.pdfium.wasmExports.malloc(4);
          const t = m.pdfium.wasmExports.malloc(4);
          const mat = m.pdfium.wasmExports.malloc(24);
          try {
            if (!m.FPDFPageObj_GetBounds(ptr, l, b, rr, t)) continue;
            let base = m.pdfium.getValue(b, "float");
            if (m.FPDFPageObj_GetMatrix(ptr, mat))
              base = m.pdfium.getValue(mat + 20, "float");
            seg.push({
              x: m.pdfium.getValue(l, "float"),
              right: m.pdfium.getValue(rr, "float"),
              base: Math.round(base),
            });
            const len = m.FPDFTextObj_GetText(ptr, tp, 0, 0);
            if (len > 2) {
              const buf = m.pdfium.wasmExports.malloc(len);
              try {
                m.FPDFTextObj_GetText(ptr, tp, buf, len);
                let str = "";
                for (let o = 0; o < len - 2; o += 2)
                  str += String.fromCharCode(m.pdfium.getValue(buf + o, "i16"));
                if (str.includes("ÿ")) hasY = true;
              } finally {
                m.pdfium.wasmExports.free(buf);
              }
            }
          } finally {
            m.pdfium.wasmExports.free(l);
            m.pdfium.wasmExports.free(b);
            m.pdfium.wasmExports.free(rr);
            m.pdfium.wasmExports.free(t);
            m.pdfium.wasmExports.free(mat);
          }
        }
      } finally {
        m.FPDFText_ClosePage(tp);
      }
      // Largest gap between consecutive glyphs on the TOP line.
      const top = seg.length ? Math.max(...seg.map((g) => g.base)) : 0;
      const line = seg
        .filter((g) => Math.abs(g.base - top) <= 2)
        .sort((a, b) => a.x - b.x);
      let maxGap = 0;
      for (let i = 1; i < line.length; i++) {
        maxGap = Math.max(maxGap, line[i].x - line[i - 1].right);
      }
      return {
        boundsRight: r.bounds.x + r.bounds.width,
        pageWidth: pg.width,
        fontId: r.fontId as string,
        text: (r.text as string) ?? "",
        maxGap,
        hasYdieresis: hasY,
      };
    },
    { pageIdx, id },
  );
}

test.describe("v2 editor - fixed-issue regressions", () => {
  // ISSUE: a single-line run grows past the right page edge when you type a
  // long string - the overflow is clipped/lost in the saved PDF instead of
  // wrapping or being clamped to the page.
  test("typing a long string into a single-line run stays on the page", async ({
    page,
  }) => {
    await open(page, SAMPLE, 0);
    const id = await findId(page, 0, "Adobe.*Acrobat.*Alternative");
    await caretEndInsert(
      page,
      id,
      " plus a very long appended tail that keeps going and going and going",
    );
    await blur(page, id);
    const g = await glyphs(page, 0, id);
    expect(
      g.boundsRight,
      "run must not extend past the page width",
    ).toBeLessThanOrEqual(g.pageWidth + 2);
  });

  // ISSUE: typing non-Latin text (CJK / emoji) into a paragraph re-emits the
  // WHOLE paragraph (surrogate guard bails), so every original line loses its
  // source font objects.
  test("typing non-Latin text keeps the paragraph's other lines' objects", async ({
    page,
  }) => {
    await open(page, SAMPLE, 1);
    const id = await findId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const before = await leafPtrs(page, 1, id);
    await caretEndInsert(page, id, " 日本語 🎉");
    await blur(page, id);
    const after = await leafPtrs(page, 1, id);
    const kept = before.filter((p) => after.includes(p)).length;
    expect(
      kept,
      "unedited lines must keep their objects when non-Latin text is added",
    ).toBe(before.length);
  });

  // ISSUE: non-Latin glyphs render as U+00FF (ydieresis "ÿ") tofu because the
  // base-14 fallback font has no glyph for them.
  test("typing non-Latin text does not render as ydieresis tofu", async ({
    page,
  }) => {
    await open(page, SAMPLE, 1);
    const id = await findId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    await caretEndInsert(page, id, " 日本語");
    await blur(page, id);
    const g = await glyphs(page, 1, id);
    expect(g.hasYdieresis, "CJK must not be replaced by 'ÿ' tofu glyphs").toBe(
      false,
    );
  });

  // ISSUE: typing an emoji (astral / surrogate-pair char) then saving must
  // round-trip the FULL surrogate pair - a code-unit-level edit could split it
  // and leave a lone surrogate, and the base-14 fallback must not render it as
  // U+00FF ("ÿ") tofu. Exercises the surrogate path through a save+reopen.
  test("typing an emoji round-trips without a lone surrogate or U+00FF tofu", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, SAMPLE, 1);
    const id = await findId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    await caretEndInsert(page, id, " 🎉");
    await blur(page, id);

    // Save, then reopen the produced bytes.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const saved = Buffer.concat(chunks);

    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "emoji-round-trip.pdf",
      mimeType: "application/pdf",
      buffer: saved,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p1-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);

    const reopened = await page.evaluate(() => {
      const s = (window as any).__v2_editor_store;
      return s.doc
        .page(1)
        .runs.map((r: any) => r.text)
        .join("");
    });
    // No lone high surrogate (one not immediately followed by a low surrogate).
    expect(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(reopened),
      "saved model must not contain a lone surrogate",
    ).toBe(false);
    expect(
      reopened.includes("ÿ"),
      "emoji must not be replaced by 'ÿ' tofu",
    ).toBe(false);
  });

  // NOTE: two more issues are VISUALLY confirmed (see __qa screenshots) but
  // omitted here because a stable automated assertion is hard:
  //   - replacing a long Type3 run with a short string leaves the surviving
  //     glyphs spread out ("He llo  Wo r ld") - kept glyphs are not re-flowed.
  //   - deleting a word from a Type3 line leaves an internal gap
  //     ("The Free Adobe Acrob   at" after removing "Alternative").

  // ISSUE: deleting the LEADING word of a paragraph line injects a stray
  // U+00FF ("ÿ") into the model text.
  test("deleting the leading word does not inject a U+00FF artifact", async ({
    page,
  }) => {
    await open(page, SAMPLE, 1);
    const id = await findId(page, 1, "Comprehensive\\s+toolkit");
    const cur = await page.evaluate(
      (rid: string) =>
        (window as any).__v2_editor_store.doc
          .page(1)
          .runs.find((x: any) => x.id === rid).text as string,
      id,
    );
    await replaceAll(page, id, cur.replace(/^Comprehensive/, ""));
    await blur(page, id);
    const g = await glyphs(page, 1, id);
    expect(g.text.includes("ÿ"), "model text must not contain 'ÿ'").toBe(false);
  });

  // ISSUE: deleting a single character from the MIDDLE of a Type3 word leaves
  // a spurious space at the deletion point ("Comprehensive" -> "Compre ensive"
  // after removing the 'h') - the surviving glyphs are not re-flowed together.
  test("deleting a mid-word character does not inject a spurious space", async ({
    page,
  }) => {
    await open(page, SAMPLE, 1);
    const id = await findId(page, 1, "Comprehensive\\s+toolkit");
    const cur = await page.evaluate(
      (rid: string) =>
        (window as any).__v2_editor_store.doc
          .page(1)
          .runs.find((x: any) => x.id === rid).text as string,
      id,
    );
    // drop the 'h' from "Comprehensive" -> the word should read "Compreensive"
    await replaceAll(page, id, cur.replace("Comprehensive", "Compreensive"));
    await blur(page, id);
    const g = await glyphs(page, 1, id);
    expect(
      g.text.includes("Compre ensive"),
      "mid-word delete must not split the word with a space",
    ).toBe(false);
  });

  // ISSUE: inserting an image through the toolbar picker (the v2-image-input
  // file input) does not add an image to the page - the count stays the same.
  // createImageBitmap works headless (verified), so this is a real no-op, not
  // an environment limitation.
  test("inserting an image via the picker adds an image to the page", async ({
    page,
  }) => {
    await open(page, SAMPLE, 0);
    const countImages = () =>
      page.evaluate(() => {
        const s = (window as any).__v2_editor_store;
        return s.doc
          .loadedPages()
          .reduce((n: number, p: any) => n + p.images.length, 0);
      });
    const before = await countImages();
    // a 1x1 red PNG, decoded in-browser by handleInsertImage
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await page.locator('[data-testid="v2-image-input"]').setInputFiles({
      name: "dot.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page.waitForTimeout(1800);
    const after = await countImages();
    expect(after, "image insert must add an image to the page").toBeGreaterThan(
      before,
    );
  });

  // ISSUE: injecting several consecutive spaces into a multi-line paragraph
  // collapses them - the paragraph-edit/overlay path re-derives spacing from
  // glyph geometry, so "Stirling     PDF" (5 spaces) lands in the model with
  // fewer spaces and the saved PDF loses the intended gap. (A short single-line
  // replace preserves them, so this is specific to the multi-line path.)
  test("injecting consecutive spaces into a paragraph preserves them", async ({
    page,
  }) => {
    await open(page, SAMPLE, 1);
    const id = await findId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const cur = await page.evaluate(
      (rid: string) =>
        (window as any).__v2_editor_store.doc
          .page(1)
          .runs.find((x: any) => x.id === rid).text as string,
      id,
    );
    await replaceAll(
      page,
      id,
      cur.replace(/Stirling\s+PDF/, "Stirling     PDF"),
    );
    await blur(page, id);
    const g = await glyphs(page, 1, id);
    expect(
      /Stirling {5}PDF/.test(g.text),
      "five consecutive injected spaces must survive into the model",
    ).toBe(true);
  });

  // ISSUE: redo after undo-all does NOT reproduce the text the original edit
  // produced. A simple append to a Type3 paragraph keeps the source glyphs on
  // first apply, but redo re-emits the whole paragraph through the overlay path
  // (collapsing the Type3 double-space extraction), so redone != edited.
  test("redo after undo-all reproduces the originally edited text", async ({
    page,
  }) => {
    await open(page, SAMPLE, 1);
    const id = await findId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const get = (): Promise<string> =>
      page.evaluate((r: string) => {
        const x = (window as any).__v2_editor_store.doc
          .page(1)
          .runs.find((y: any) => y.id === r);
        return x ? (x.text as string) : "(gone)";
      }, id);
    await caretEndInsert(page, id, " UNIQ");
    await blur(page, id);
    const edited = await get();
    await page.evaluate(() => (window as any).__v2_editor_store.resetAll());
    await page.waitForTimeout(400);
    // Redo until the button is disabled. The edit + its auto-reflow coalesce
    // into ONE undo/redo step, so this is typically a single click - clicking
    // a disabled button would hang, so stop once redo is exhausted.
    for (let i = 0; i < 6; i++) {
      const redoBtn = page.getByTestId("v2-redo");
      if (await redoBtn.isDisabled()) break;
      await redoBtn.click();
      await page.waitForTimeout(120);
    }
    const redone = await get();
    expect(
      redone,
      "redo must reproduce the exact text the original edit produced",
    ).toBe(edited);
  });

  // ISSUE / LIMITATION: editing embedded / subset / form-xobject text used to
  // re-font the run to base-14 Helvetica even when the edit only adds chars the
  // subset already embeds. Appending chars present in the source ("test", all
  // of which appear in "Subset font sample") must keep the subset font - the
  // reuse is safe because those glyphs are proven present, and emitTextLine
  // falls back to base-14 only if a reused glyph fails to render.
  test("editing a subset-font run keeps a non-base-14 font", async ({
    page,
  }) => {
    await open(page, SUBSET, 0);
    const id = await findId(page, 0, "Subset font sample");
    await caretEndInsert(page, id, "test");
    await blur(page, id);
    const g = await glyphs(page, 0, id);
    expect(
      g.fontId.startsWith("base14:"),
      "subset edit flips to Helvetica",
    ).toBe(false);
  });

  // ISSUE / UX: a single Enter-then-type produces several `input` events, so
  // several undo steps are needed to revert one logical edit. One undo should
  // suffice.
  test("one undo reverts a single Enter+type action", async ({ page }) => {
    await open(page, SAMPLE, 1);
    const id = await findId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const before = await page.evaluate(
      (rid: string) =>
        (window as any).__v2_editor_store.doc
          .page(1)
          .runs.find((x: any) => x.id === rid).text as string,
      id,
    );
    await caretEndInsert(page, id, "\n");
    await caretEndInsert(page, id, "Z");
    await page.getByTestId("v2-undo").click();
    // Poll for the revert rather than a fixed wait - the undo's store update can
    // lag the click under load, which made a single fixed timeout flaky.
    await expect
      .poll(
        () =>
          page.evaluate(
            (rid: string) =>
              ((window as any).__v2_editor_store.doc
                .page(1)
                .runs.find((x: any) => x.id === rid)?.text ?? null) as
                | string
                | null,
            id,
          ),
        { timeout: 6000, message: "one undo should fully revert Enter+type" },
      )
      .toBe(before);
  });

  // ISSUE: opening an ENCRYPTED PDF fails silently - the editor shows "No
  // document loaded" with no error message and no password prompt. It now
  // prompts for the password (client-side decrypt) instead of dead-ending.
  test("opening an encrypted PDF surfaces an error or password prompt", async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(path.join(__dirname, "../test-fixtures/encrypted.pdf"));
    await page.waitForTimeout(2500);
    const loaded = await page.getByTestId("v2-page-0").count();
    const error = await page.getByTestId("v2-error").count();
    const prompt = await page.getByTestId("v2-password-modal").count();
    expect(
      loaded > 0 || error > 0 || prompt > 0,
      "an encrypted PDF must either open or tell the user why it can't",
    ).toBe(true);
  });

  // ISSUE: opening a CORRUPTED PDF fails silently - same "No document loaded"
  // with no error feedback.
  test("opening a corrupted PDF surfaces an error", async ({ page }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(path.join(__dirname, "../test-fixtures/corrupted.pdf"));
    await page.waitForTimeout(2500);
    const loaded = await page.getByTestId("v2-page-0").count();
    const error = await page.getByTestId("v2-error").count();
    expect(
      loaded > 0 || error > 0,
      "a corrupted PDF must surface an error instead of failing silently",
    ).toBe(true);
  });
});
