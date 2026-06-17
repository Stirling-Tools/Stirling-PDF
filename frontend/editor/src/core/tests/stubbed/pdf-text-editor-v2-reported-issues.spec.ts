import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

/**
 * Regression coverage for three user-reported issues:
 *  1. Align/distribute buttons stayed disabled because shift-click did not
 *     reliably add a 2nd run to the selection (TextRunOverlay focused the
 *     run before selecting and never preventDefault'd). FIXED - these tests
 *     drive the REAL shift-click DOM gesture (not store.selectMany).
 *  2. Inserting a character must keep the run text correct and must never
 *     emit the U+00FF "ydieresis" tofu, across different page sections.
 *  3. Bullet glyphs on the "Plus Many More" page are detached from their
 *     list items into an orphan bullet-only run - documented as a known
 *     grouping bug via test.fail until the grouper is reworked.
 */
const SAMPLE = path.join(__dirname, "../../../../public/samples/Sample.pdf");

async function open(page: any, firstPage = 0): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId(`v2-page-${firstPage}`)).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
}
async function runId(page: any, pageIdx: number, src: string): Promise<string> {
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
  if (!id) throw new Error(`run /${src}/ not found`);
  return id;
}
async function runText(
  page: any,
  pageIdx: number,
  id: string,
): Promise<string> {
  return page.evaluate(
    ({ pageIdx, id }: { pageIdx: number; id: string }) => {
      const r = (window as any).__v2_editor_store.doc
        .page(pageIdx)
        .runs.find((x: any) => x.id === id);
      return r ? (r.text as string) : "(gone)";
    },
    { pageIdx, id },
  );
}
async function selRunCount(page: any): Promise<number> {
  return page.evaluate(
    () => (window as any).__v2_editor_store.selection.value.runIds.length,
  );
}
/** Append text into a run via the contentEditable overlay, then blur. */
async function appendViaOverlay(
  page: any,
  id: string,
  text: string,
): Promise<void> {
  await page.evaluate(
    ({ rid, text }: { rid: string; text: string }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      if (!el) throw new Error("run el missing");
      el.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
    },
    { rid: id, text },
  );
  await page.waitForTimeout(150);
  await page.evaluate(
    (rid: string) =>
      document
        .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
        ?.blur(),
    id,
  );
  await page.waitForTimeout(900);
}

test.describe("v2 editor - reported issue: align multi-select (real UI)", () => {
  test("shift-click adds a 2nd run, which enables and applies align-left", async ({
    page,
  }) => {
    await open(page, 1);
    const a = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const b = await runId(page, 1, "Comprehensive\\s+toolkit");
    // Plain click selects A; align needs 2+, so it is still disabled.
    await page.getByTestId(`v2-run-${a}`).click();
    await page.waitForTimeout(150);
    expect(await selRunCount(page)).toBe(1);
    await expect(page.getByTestId("v2-align-left")).toBeDisabled();
    // Shift-click B must ADD it (the bug was it failed to add).
    await page.getByTestId(`v2-run-${b}`).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(200);
    expect(await selRunCount(page), "shift-click adds a 2nd run").toBe(2);
    await expect(page.getByTestId("v2-align-left")).toBeEnabled();
    // And it actually aligns the two left edges.
    await page.getByTestId("v2-align-left").click();
    await page.waitForTimeout(250);
    const xs = await page.evaluate(
      ({ a, b }: { a: string; b: string }) => {
        const pg = (window as any).__v2_editor_store.doc.page(1);
        return [
          pg.runs.find((r: any) => r.id === a).bounds.x,
          pg.runs.find((r: any) => r.id === b).bounds.x,
        ];
      },
      { a, b },
    );
    expect(Math.abs(xs[0] - xs[1])).toBeLessThan(1.5);
  });

  test("shift-clicking the same run twice toggles it back off (align re-disables)", async ({
    page,
  }) => {
    await open(page, 1);
    const a = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const b = await runId(page, 1, "Comprehensive\\s+toolkit");
    await page.getByTestId(`v2-run-${a}`).click();
    await page.getByTestId(`v2-run-${b}`).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(200);
    expect(await selRunCount(page)).toBe(2);
    await expect(page.getByTestId("v2-align-left")).toBeEnabled();
    // Shift-click B again removes it -> back to 1 -> align disabled.
    await page.getByTestId(`v2-run-${b}`).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(200);
    expect(await selRunCount(page)).toBe(1);
    await expect(page.getByTestId("v2-align-left")).toBeDisabled();
  });

  test("distribute needs three runs: enabled only after a 3rd shift-click", async ({
    page,
  }) => {
    await open(page, 1);
    const a = await runId(page, 1, "What\\s+is\\s+Stirling");
    const b = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    const c = await runId(page, 1, "Comprehensive\\s+toolkit");
    await page.getByTestId(`v2-run-${a}`).click();
    await page.getByTestId(`v2-run-${b}`).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(150);
    await expect(page.getByTestId("v2-distribute-v")).toBeDisabled();
    await page.getByTestId(`v2-run-${c}`).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(200);
    expect(await selRunCount(page)).toBe(3);
    await expect(page.getByTestId("v2-distribute-v")).toBeEnabled();
  });
});

test.describe("v2 editor - reported issue: align a single paragraph's lines", () => {
  async function selectOne(page: any, id: string): Promise<void> {
    await page.evaluate(
      (rid: string) =>
        (window as any).__v2_editor_store.selection.selectOne(rid),
      id,
    );
    await page.waitForTimeout(120);
  }
  async function lineRights(page: any, id: string): Promise<number[]> {
    return page.evaluate((rid: string) => {
      const run = (window as any).__v2_editor_store.doc
        .page(1)
        .runs.find((r: any) => r.id === rid);
      return (run?.paragraphLineSlots ?? []).map((s: any) =>
        Math.max(...s.mergedFromBounds.map((b: any) => b.right)),
      );
    }, id);
  }
  async function lineLefts(page: any, id: string): Promise<number[]> {
    return page.evaluate((rid: string) => {
      const run = (window as any).__v2_editor_store.doc
        .page(1)
        .runs.find((r: any) => r.id === rid);
      return (run?.paragraphLineSlots ?? []).map((s: any) =>
        Math.min(...s.mergedFromBounds.map((b: any) => b.x)),
      );
    }, id);
  }

  test("align buttons enable for a single multi-line paragraph", async ({
    page,
  }) => {
    await open(page, 1);
    const para = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    await selectOne(page, para);
    // Horizontal aligns enable on a single paragraph...
    await expect(page.getByTestId("v2-align-left")).toBeEnabled();
    await expect(page.getByTestId("v2-align-right")).toBeEnabled();
    await expect(page.getByTestId("v2-align-center-h")).toBeEnabled();
    // ...but vertical aligns still need 2+ objects.
    await expect(page.getByTestId("v2-align-top")).toBeDisabled();
  });

  test("align buttons stay disabled for a single single-line run", async ({
    page,
  }) => {
    await open(page, 1);
    const heading = await runId(page, 1, "What\\s+is\\s+Stirling");
    await selectOne(page, heading);
    await expect(page.getByTestId("v2-align-left")).toBeDisabled();
    await expect(page.getByTestId("v2-align-right")).toBeDisabled();
  });

  test("align-right flushes a paragraph's lines to a shared right edge; undo reverts", async ({
    page,
  }) => {
    await open(page, 1);
    const para = await runId(page, 1, "Stirling\\s+PDF\\s+is\\s+a\\s+robust");
    await selectOne(page, para);
    const before = await lineRights(page, para);
    expect(before.length, "paragraph has multiple lines").toBeGreaterThan(1);
    await page.getByTestId("v2-align-right").click();
    await page.waitForTimeout(300);
    const after = await lineRights(page, para);
    expect(
      Math.max(...after) - Math.min(...after),
      "all lines share a right edge",
    ).toBeLessThan(1.5);
    // Undo restores the original per-line right edges.
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(300);
    const reverted = await lineRights(page, para);
    for (let i = 0; i < before.length; i++) {
      expect(reverted[i]).toBeCloseTo(before[i], 0);
    }
  });

  test("align-left flushes a paragraph's lines to a shared left edge", async ({
    page,
  }) => {
    await open(page, 1);
    const para = await runId(page, 1, "Comprehensive\\s+toolkit");
    await selectOne(page, para);
    const before = await lineLefts(page, para);
    expect(before.length).toBeGreaterThan(1);
    await page.getByTestId("v2-align-left").click();
    await page.waitForTimeout(300);
    const after = await lineLefts(page, para);
    expect(
      Math.max(...after) - Math.min(...after),
      "all lines share a left edge",
    ).toBeLessThan(1.5);
  });
});

test.describe("v2 editor - reported issue: character insertion + font integrity", () => {
  test("inserting a duplicate letter into an embedded-font run keeps text correct and emits no ydieresis tofu", async ({
    page,
  }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Multi-Language\\s+Support");
    await appendViaOverlay(page, id, "S");
    const text = await runText(page, 1, id);
    expect(text, "appended char is present").toMatch(/SupportS\s*$/);
    expect(text, "no U+00FF tofu").not.toContain("ÿ");
  });

  test("inserting into a large heading section keeps text correct and tofu-free", async ({
    page,
  }) => {
    await open(page, 0);
    const id = await runId(page, 0, "Adobe\\s+Acrobat\\s+Alternative");
    const before = await runText(page, 0, id);
    await appendViaOverlay(page, id, "X");
    const after = await runText(page, 0, id);
    expect(after.length, "text grew by the inserted char").toBeGreaterThan(
      before.length,
    );
    expect(after).toContain("X");
    expect(after).not.toContain("ÿ");
  });

  test("inserting a character that already exists elsewhere in the run is tofu-free", async ({
    page,
  }) => {
    await open(page, 1);
    const id = await runId(page, 1, "Open\\s+Source");
    // 'p' is not in "Open Source"; 'e'/'o'/'r'/'S' are. Insert an 'e'.
    await appendViaOverlay(page, id, "e");
    const text = await runText(page, 1, id);
    expect(text).toMatch(/e\s*$/);
    expect(text).not.toContain("ÿ");
  });

  test("inserting a duplicate char reuses the embedded glyph via the client-side content-stream fallback", async ({
    page,
  }) => {
    // No backend in the stubbed project, so the default 'backend' resolver
    // misses; the fix falls back to the client-side content-stream resolver
    // (self-validated against the on-page glyph advance) so the inserted 'S'
    // reuses "Support"'s embedded glyph instead of flipping to Helvetica.
    await open(page, 1);
    const id = await runId(page, 1, "Multi-Language\\s+Support");
    await page.evaluate(() => ((window as any).__v2_charcode_events = []));
    await appendViaOverlay(page, id, "S");
    const outcomes = await page.evaluate(
      () =>
        ((window as any).__v2_charcode_events ?? []).map(
          (e: any) => `${e.strategy}:${e.outcome}`,
        ) as string[],
    );
    expect(
      outcomes.some((o) => o === "content-stream:charcodes-ok"),
      `expected a content-stream reuse; got ${JSON.stringify(outcomes)}`,
    ).toBe(true);
    const text = await runText(page, 1, id);
    expect(text).not.toContain("ÿ");
  });

  test("character insertion telemetry records an emit attempt (font-reuse vs fallback)", async ({
    page,
  }) => {
    // The window telemetry buffer records the outcome of every emit. We
    // assert an emit happened and (in the no-backend stubbed env) it is one
    // of the known outcomes - documenting that the path runs without error.
    await open(page, 1);
    const id = await runId(page, 1, "Multi-Language\\s+Support");
    await page.evaluate(
      () => ((window as any).__v2_charcode_events = []) as unknown as void,
    );
    await appendViaOverlay(page, id, "S");
    const outcomes = await page.evaluate(
      () =>
        ((window as any).__v2_charcode_events ?? []).map(
          (e: any) => e.outcome,
        ) as string[],
    );
    // At least one emit event fired for the edit.
    expect(outcomes.length).toBeGreaterThan(0);
    const known = [
      "charcodes-ok",
      "charcodes-call-failed",
      "partial-coverage-fallback",
      "no-strategy",
      "no-font",
    ];
    for (const o of outcomes) expect(known).toContain(o);
  });
});

test.describe("v2 editor - reported issue: bullet-to-item mapping", () => {
  async function loadPage2(page: any): Promise<void> {
    await open(page, 0);
    await page.evaluate(() => {
      document.querySelector('[data-testid="v2-page-1"]')?.scrollIntoView();
      document.querySelector('[data-testid="v2-page-2"]')?.scrollIntoView();
    });
    await expect(page.getByTestId("v2-page-2")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(2000);
  }

  // FIXED by the LineGrouper rework (font-scaled sort band + bullet-indent
  // gap): bullets now attach to their list items instead of forming an
  // orphan stacked bullet-only run.
  test("bullets attach to their list items (not an orphan bullet-only run)", async ({
    page,
  }) => {
    await loadPage2(page);
    const hasOrphanBulletRun = await page.evaluate(() => {
      const s = (window as any).__v2_editor_store;
      const runs = s.doc.page(2).runs as Array<{ text: string }>;
      // An "orphan" run is one whose text is ONLY bullets + whitespace
      // and holds 2+ bullets (the stacked bullet column).
      return runs.some(
        (r) =>
          /^[\s•]+$/.test(r.text) && (r.text.match(/•/g) ?? []).length >= 2,
      );
    });
    expect(
      hasOrphanBulletRun,
      "bullets should attach to items, not form a stacked bullet-only run",
    ).toBe(false);
  });
});
