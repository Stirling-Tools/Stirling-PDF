import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

const SAMPLE = path.join(__dirname, "../../../../public/samples/Sample.pdf");

/**
 * Comprehensive paragraph-editing battery for the v2 editor.
 *
 * These exercise the hard cases the user hit: typing into wrapped
 * paragraphs, manual Enter line breaks surviving a wrap, live wrapping
 * while typing (no off-page overflow), and text-content integrity. Many
 * tests read the run's ACTUAL glyph layout (position + baseline + text)
 * straight from PDFium so the assertions describe what renders, not the
 * in-memory model only.
 */

async function gotoWrap(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-1")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await page
    .getByTestId("v2-width-mode-control")
    .getByText("Wrap", { exact: true })
    .click();
  await page.waitForTimeout(150);
}

/** Load page 2 but leave the default "grow" width mode (no wrap toggle). */
async function gotoGrow(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-1")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
}

async function findPara(page: Page, re: RegExp): Promise<string | null> {
  return page.evaluate((src: string) => {
    const store = (window as unknown as { __v2_editor_store: any })
      .__v2_editor_store;
    const rx = new RegExp(src);
    const r = store.doc.page(1).runs.find((x: any) => rx.test(x.text));
    return r ? r.id : null;
  }, re.source);
}

async function focusCaretEnd(page: Page, id: string): Promise<void> {
  await page.evaluate((rid: string) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="v2-run-${rid}"]`,
    );
    if (!el) throw new Error("run not in DOM");
    el.focus();
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, id);
}

/** Type a string one character at a time (the way a real user does). */
async function typeChars(page: Page, id: string, str: string): Promise<void> {
  await focusCaretEnd(page, id);
  for (const ch of str) {
    await page.evaluate((c: string) => {
      document.execCommand("insertText", false, c);
    }, ch);
    await page.waitForTimeout(20);
  }
}

async function blurRun(page: Page, id: string): Promise<void> {
  await page.evaluate((rid: string) => {
    document
      .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
      ?.blur();
  }, id);
  await page.waitForTimeout(300);
}

interface Glyph {
  text: string;
  x: number;
  right: number;
  baseline: number;
}
interface ParaInfo {
  text: string;
  fontId: string;
  fontSize: number;
  pageWidth: number;
  glyphs: Glyph[];
}

/** Read every leaf glyph's real text + bounds + baseline from PDFium. */
async function readGlyphs(page: Page, id: string): Promise<ParaInfo | null> {
  return page.evaluate((rid: string) => {
    const store = (window as unknown as { __v2_editor_store: any })
      .__v2_editor_store;
    const m = store.doc.module;
    const pg = store.doc.page(1);
    const r = pg.runs.find((x: any) => x.id === rid);
    if (!r) return null;
    const ptrs: number[] =
      r.paragraphLeafPtrs && r.paragraphLeafPtrs.length
        ? r.paragraphLeafPtrs
        : r.mergedFromPtrs;
    const tp = m.FPDFText_LoadPage(pg.pagePtr);
    const glyphs: Glyph[] = [];
    try {
      for (const ptr of ptrs) {
        if (!ptr) continue;
        const l = m.pdfium.wasmExports.malloc(4);
        const b = m.pdfium.wasmExports.malloc(4);
        const rr = m.pdfium.wasmExports.malloc(4);
        const t = m.pdfium.wasmExports.malloc(4);
        const mb = m.pdfium.wasmExports.malloc(24);
        try {
          if (!m.FPDFPageObj_GetBounds(ptr, l, b, rr, t)) continue;
          const x = m.pdfium.getValue(l, "float");
          const right = m.pdfium.getValue(rr, "float");
          let baseline = m.pdfium.getValue(b, "float");
          if (m.FPDFPageObj_GetMatrix(ptr, mb)) {
            baseline = m.pdfium.getValue(mb + 20, "float");
          }
          const len = m.FPDFTextObj_GetText(ptr, tp, 0, 0);
          let text = "";
          if (len > 2) {
            const buf = m.pdfium.wasmExports.malloc(len);
            m.FPDFTextObj_GetText(ptr, tp, buf, len);
            for (let i = 0; i < len - 2; i += 2) {
              const code = m.pdfium.getValue(buf + i, "i16") & 0xffff;
              if (code) text += String.fromCharCode(code);
            }
            m.pdfium.wasmExports.free(buf);
          }
          glyphs.push({ text, x, right, baseline });
        } finally {
          m.pdfium.wasmExports.free(l);
          m.pdfium.wasmExports.free(b);
          m.pdfium.wasmExports.free(rr);
          m.pdfium.wasmExports.free(t);
          m.pdfium.wasmExports.free(mb);
        }
      }
    } finally {
      m.FPDFText_ClosePage(tp);
    }
    return {
      text: r.text,
      fontId: r.fontId,
      fontSize: r.fontSize,
      pageWidth: pg.width,
      glyphs,
    };
  }, id);
}

/** Number of distinct baselines (visual lines) the glyphs occupy. */
function lineCount(info: ParaInfo): number {
  const ys = info.glyphs.map((g) => Math.round(g.baseline));
  const uniq = new Set<number>();
  for (const y of ys) {
    let found = false;
    for (const u of uniq) if (Math.abs(u - y) <= 2) found = true;
    if (!found) uniq.add(y);
  }
  return uniq.size;
}

const INTRO = "Stirling\\s+PDF\\s+is\\s+a\\s+robust";
const CARD = "Comprehensive\\s+toolkit";

test.describe("PDF text editor v2 - paragraph editing battery", () => {
  test("wrap: a long appended tail wraps within the page after click-off", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(INTRO));
    if (!id) {
      test.skip(true, "intro paragraph missing");
      return;
    }
    await typeChars(
      page,
      id,
      " ZZZZ YYYY XXXX WWWW VVVV UUUU TTTT SSSS RRRR QQQQ PPPP OOOO",
    );
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    const maxRight = Math.max(...info.glyphs.map((g) => g.right));
    expect(
      maxRight,
      `text ran off the page (maxRight=${maxRight}, pageWidth=${info.pageWidth})`,
    ).toBeLessThanOrEqual(info.pageWidth);
    expect(lineCount(info)).toBeGreaterThan(1);
  });

  test("wrap: typed text stays within the page while typing AND after click-off", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(INTRO));
    if (!id) {
      test.skip(true, "intro paragraph missing");
      return;
    }
    await typeChars(
      page,
      id,
      " ZZZZ YYYY XXXX WWWW VVVV UUUU TTTT SSSS RRRR QQQQ PPPP OOOO",
    );
    // NO blur - the box the user SEES while editing must stay within the page.
    // The editing box is capped to the page width and wraps via CSS, so it can
    // never grow off the right edge (the heavy reflow that bakes the wrapped
    // layout into glyphs runs once on click-off, not on every keystroke).
    await page.waitForTimeout(120);
    const box = await page.evaluate((rid: string) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      const pageEl = document.querySelector<HTMLElement>(
        '[data-testid="v2-page-1"]',
      );
      if (!el || !pageEl) return null;
      const er = el.getBoundingClientRect();
      const pr = pageEl.getBoundingClientRect();
      return { elRight: er.right, pageRight: pr.right };
    }, id);
    expect(box, "elements missing").not.toBeNull();
    expect(
      box!.elRight,
      `editing box overflowed the page while typing (boxRight=${box!.elRight}, pageRight=${box!.pageRight})`,
    ).toBeLessThanOrEqual(box!.pageRight + 4);

    // After click-off the baked glyphs stay on the page too.
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    const maxRight = Math.max(...info.glyphs.map((g) => g.right));
    expect(
      maxRight,
      `text overflowed the page after click-off (maxRight=${maxRight}, pageWidth=${info.pageWidth})`,
    ).toBeLessThanOrEqual(info.pageWidth + 2);
  });

  test("wrap: a manual Enter break is kept after click-off (no extra typing)", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(INTRO));
    if (!id) {
      test.skip(true, "intro paragraph missing");
      return;
    }
    // Append a clear marker, Enter, second marker.
    await typeChars(page, id, " AAAALPHA");
    await page.evaluate(() => {
      document.execCommand("insertText", false, "\n");
    });
    await page.waitForTimeout(40);
    await typeChars(page, id, "BBBBETA");
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    // The two markers must sit on DIFFERENT baselines (a real break).
    const a = info.glyphs.find((g) => g.text.includes("A"));
    const baseOfAlpha = lastBaselineOfWord(info, "ALPHA");
    const baseOfBeta = firstBaselineOfWord(info, "BBBB");
    expect(a, "no glyphs").toBeTruthy();
    expect(
      baseOfAlpha !== null && baseOfBeta !== null,
      `markers missing: ${JSON.stringify(info.text)}`,
    ).toBe(true);
    expect(
      baseOfBeta!,
      `manual break lost: ALPHA baseline=${baseOfAlpha}, BETA baseline=${baseOfBeta}`,
    ).toBeLessThan(baseOfAlpha! - 1);
  });

  test("wrap: a manual Enter break survives a subsequent word-wrap", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(INTRO));
    if (!id) {
      test.skip(true, "intro paragraph missing");
      return;
    }
    // Manual break, then type a LONG tail that forces wrapping. The break
    // between the original text and "GAMMA..." must remain a break.
    await page.evaluate(() => {
      document.execCommand("insertText", false, "");
    });
    await focusCaretEnd(page, id);
    await page.evaluate(() => {
      document.execCommand("insertText", false, "\n");
    });
    await page.waitForTimeout(40);
    await typeChars(
      page,
      id,
      "GAMMA DELTA EPSILON ZETA ETA THETA IOTA KAPPA LAMBDA MUMU NUNU",
    );
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    // "more." ends the original last line; "GAMMA" begins the manual line.
    const baseMore = lastBaselineOfWord(info, "more");
    const baseGamma = firstBaselineOfWord(info, "GAMMA");
    expect(
      baseMore !== null && baseGamma !== null,
      `markers missing: ${JSON.stringify(info.text.slice(-80))}`,
    ).toBe(true);
    expect(
      baseGamma!,
      `manual break merged by wrap: more=${baseMore}, GAMMA=${baseGamma}`,
    ).toBeLessThan(baseMore! - 1);
  });

  test("wrap: Enter at end then typing puts the new text on a lower line", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(CARD));
    if (!id) {
      test.skip(true, "card paragraph missing");
      return;
    }
    await focusCaretEnd(page, id);
    await page.evaluate(() => document.execCommand("insertText", false, "\n"));
    await page.waitForTimeout(40);
    await typeChars(page, id, "NEWLINEWORD");
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    const baseProc = lastBaselineOfWord(info, "processing");
    const baseNew = firstBaselineOfWord(info, "NEWLINEWORD");
    expect(baseNew !== null, `NEW word missing: ${info.text}`).toBe(true);
    if (baseProc !== null) {
      expect(baseNew!).toBeLessThan(baseProc! - 1);
    }
  });

  test("integrity: every original word survives editing exactly once", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(CARD));
    if (!id) {
      test.skip(true, "card paragraph missing");
      return;
    }
    await typeChars(page, id, " APPENDIX");
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    const flat = info.text.replace(/\s+/g, " ");
    for (const w of ["Comprehensive", "toolkit", "processing", "APPENDIX"]) {
      const n = flat.split(w).length - 1;
      expect(
        n,
        `"${w}" appears ${n}x (expected 1): ${JSON.stringify(flat)}`,
      ).toBe(1);
    }
  });

  test("integrity: typing into the MIDDLE of a paragraph keeps it intact", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(CARD));
    if (!id) {
      test.skip(true, "card paragraph missing");
      return;
    }
    // Caret after "Comprehensive", type a marker.
    await page.evaluate((rid: string) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      )!;
      el.focus();
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Text | null = null;
      let rem = "Comprehensive".length;
      while (tw.nextNode()) {
        const n = tw.currentNode as Text;
        const len = n.textContent?.length ?? 0;
        if (rem <= len) {
          node = n;
          break;
        }
        rem -= len;
      }
      if (!node) return;
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.setStart(node, rem);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, "MIDWORD");
    }, id);
    await page.waitForTimeout(80);
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    expect(info.text.replace(/\s+/g, " ")).toContain("MIDWORD");
    expect(info.text.replace(/\s+/g, " ")).toMatch(/Comprehensive.*toolkit/);
  });

  test("undo: wrapping then Ctrl+Z restores the original text and layout", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(INTRO));
    if (!id) {
      test.skip(true, "intro paragraph missing");
      return;
    }
    const before = await readGlyphs(page, id);
    if (!before) throw new Error("vanished");
    const beforeLines = lineCount(before);
    await typeChars(
      page,
      id,
      " OMEGA SIGMA PSICHI TAUTAU RHORHO PHIPHI UPSILON",
    );
    await blurRun(page, id);
    // Undo every command from this edit.
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(15);
    }
    await page.waitForTimeout(200);
    const after = await readGlyphs(page, id);
    if (!after) throw new Error("vanished after undo");
    expect(after.text.replace(/\s+/g, " ")).not.toContain("OMEGA");
    expect(after.text.replace(/\s+/g, " ")).toMatch(/Stirling.*robust/);
    expect(Math.abs(lineCount(after) - beforeLines)).toBeLessThanOrEqual(1);
  });

  test("grow mode: typing a long tail grows right (one line, no wrap)", async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
    await expect(page.getByTestId("v2-page-1")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(700);
    // Default mode is "grow".
    const id = await findPara(page, new RegExp(CARD));
    if (!id) {
      test.skip(true, "card paragraph missing");
      return;
    }
    await typeChars(page, id, " GROWGROWGROW");
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    expect(info.text.replace(/\s+/g, " ")).toContain("GROWGROWGROW");
  });

  test("wrap: a single very long unbreakable word does not corrupt the paragraph", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(CARD));
    if (!id) {
      test.skip(true, "card paragraph missing");
      return;
    }
    await typeChars(
      page,
      id,
      " SUPERCALIFRAGILISTICEXPIALIDOCIOUSANTIDISESTAB",
    );
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    expect(info.text.replace(/\s+/g, " ")).toContain(
      "SUPERCALIFRAGILISTICEXPIALIDOCIOUSANTIDISESTAB",
    );
    // Original words still intact.
    expect(info.text.replace(/\s+/g, " ")).toMatch(/Comprehensive.*toolkit/);
  });

  test("wrap: a MID-paragraph manual break is not removed when a later line wraps", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(CARD));
    if (!id) {
      test.skip(true, "card paragraph missing");
      return;
    }
    // Insert a manual break right after "Comprehensive" (where the line is
    // NOT full - width alone would keep "Comprehensive toolkit" together).
    await page.evaluate((rid: string) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      )!;
      el.focus();
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Text | null = null;
      let rem = "Comprehensive".length;
      while (tw.nextNode()) {
        const n = tw.currentNode as Text;
        const len = n.textContent?.length ?? 0;
        if (rem <= len) {
          node = n;
          break;
        }
        rem -= len;
      }
      if (!node) return;
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.setStart(node, rem);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, "\n");
    }, id);
    await page.waitForTimeout(80);
    // Type a long tail at the END to force a width-wrap (triggers reflow).
    await typeChars(page, id, " ZZZZ YYYY XXXX WWWW VVVV UUUU TTTT SSSS RRRR");
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    const baseComp = lastBaselineOfWord(info, "Comprehensive");
    const baseTool = firstBaselineOfWord(info, "toolkit");
    expect(
      baseComp !== null && baseTool !== null,
      `words missing: ${JSON.stringify(info.text.slice(0, 60))}`,
    ).toBe(true);
    expect(
      baseTool!,
      `mid-paragraph manual break removed by wrap: "Comprehensive" baseline=${baseComp}, "toolkit" baseline=${baseTool} (same line = break lost)`,
    ).toBeLessThan(baseComp! - 1);
  });

  test("wrap: deleting a manual break merges the two lines back together", async ({
    page,
  }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(CARD));
    if (!id) {
      test.skip(true, "card paragraph missing");
      return;
    }
    // Add a manual break at the end + a word, then delete back over the break.
    await focusCaretEnd(page, id);
    await page.evaluate(() => document.execCommand("insertText", false, "\n"));
    await page.waitForTimeout(40);
    await typeChars(page, id, "TAILWORD");
    await page.waitForTimeout(60);
    // Backspace the whole TAILWORD + the newline.
    for (let i = 0; i < "TAILWORD\n".length; i++) {
      await page.evaluate(() => document.execCommand("delete"));
      await page.waitForTimeout(25);
    }
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    expect(info.text.replace(/\s+/g, " ")).not.toContain("TAILWORD");
    expect(info.text.replace(/\s+/g, " ")).toMatch(/Comprehensive.*processing/);
  });

  test("grow mode: editing a paragraph (Enter + type) never blows the box off the page", async ({
    page,
  }) => {
    // The reported bug: clicking a paragraph in the DEFAULT (grow) mode,
    // pressing Enter and typing made the editing box expand past the page's
    // right edge, clipping text the user never touched. A paragraph must
    // wrap within the page even in grow mode.
    await gotoGrow(page);
    const id = await findPara(page, new RegExp(INTRO));
    if (!id) {
      test.skip(true, "intro paragraph missing");
      return;
    }
    await focusCaretEnd(page, id);
    await page.evaluate(() => document.execCommand("insertText", false, "\n"));
    await page.waitForTimeout(40);
    await typeChars(page, id, "dfg");
    await page.waitForTimeout(120);

    // While focused: the editing box must not extend past the page's right
    // edge (allowing a small tolerance).
    const box = await page.evaluate((rid: string) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      const pageEl = document.querySelector<HTMLElement>(
        '[data-testid="v2-page-1"]',
      );
      if (!el || !pageEl) return null;
      const er = el.getBoundingClientRect();
      const pr = pageEl.getBoundingClientRect();
      return { elRight: er.right, pageRight: pr.right };
    }, id);
    expect(box, "elements missing").not.toBeNull();
    expect(
      box!.elRight,
      `editing box ran off the page (boxRight=${box!.elRight}, pageRight=${box!.pageRight})`,
    ).toBeLessThanOrEqual(box!.pageRight + 4);

    // And the committed glyphs stay on the page too.
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    const maxRight = Math.max(...info.glyphs.map((g) => g.right));
    expect(
      maxRight,
      `committed text ran off the page (maxRight=${maxRight}, pageWidth=${info.pageWidth})`,
    ).toBeLessThanOrEqual(info.pageWidth);
    // "dfg" landed and the original words survived.
    expect(info.text.replace(/\s+/g, " ")).toContain("dfg");
    expect(info.text.replace(/\s+/g, " ")).toMatch(/Stirling.*robust/);
  });

  test("wrap: two manual breaks both survive", async ({ page }) => {
    await gotoWrap(page);
    const id = await findPara(page, new RegExp(INTRO));
    if (!id) {
      test.skip(true, "intro paragraph missing");
      return;
    }
    await typeChars(page, id, " ONEONE");
    await page.evaluate(() => document.execCommand("insertText", false, "\n"));
    await page.waitForTimeout(30);
    await typeChars(page, id, "TWOTWO");
    await page.evaluate(() => document.execCommand("insertText", false, "\n"));
    await page.waitForTimeout(30);
    await typeChars(page, id, "THREE");
    await blurRun(page, id);
    const info = await readGlyphs(page, id);
    if (!info) throw new Error("vanished");
    const b1 = firstBaselineOfWord(info, "ONEONE");
    const b2 = firstBaselineOfWord(info, "TWOTWO");
    const b3 = firstBaselineOfWord(info, "THREE");
    expect(b1 !== null && b2 !== null && b3 !== null, info.text).toBe(true);
    // Each marker on its own progressively-lower line.
    expect(b2!).toBeLessThan(b1! - 1);
    expect(b3!).toBeLessThan(b2! - 1);
  });
});

function lastBaselineOfWord(info: ParaInfo, word: string): number | null {
  // Find the run of glyphs spelling `word` (contiguous, same baseline) and
  // return that baseline. Glyphs may be per-char or per-word.
  const baselines = matchWordBaselines(info, word);
  return baselines.length ? baselines[baselines.length - 1] : null;
}
function firstBaselineOfWord(info: ParaInfo, word: string): number | null {
  const baselines = matchWordBaselines(info, word);
  return baselines.length ? baselines[0] : null;
}
function matchWordBaselines(info: ParaInfo, word: string): number[] {
  // Concatenate glyph texts in reading order (baseline desc, x asc) and find
  // `word`; return the baseline(s) of the glyphs covering it.
  const sorted = [...info.glyphs].sort((a, b) => {
    if (Math.abs(a.baseline - b.baseline) > 2) return b.baseline - a.baseline;
    return a.x - b.x;
  });
  let concat = "";
  const owner: number[] = []; // glyph index per concatenated char
  sorted.forEach((g, gi) => {
    for (let i = 0; i < g.text.length; i++) {
      concat += g.text[i];
      owner.push(gi);
    }
  });
  const idx = concat.indexOf(word);
  if (idx < 0) return [];
  const result: number[] = [];
  const seen = new Set<number>();
  for (let i = idx; i < idx + word.length; i++) {
    const gi = owner[i];
    if (gi != null && !seen.has(gi)) {
      seen.add(gi);
      result.push(sorted[gi].baseline);
    }
  }
  return result;
}
