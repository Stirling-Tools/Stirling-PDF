import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// PDFium's generator cannot emit Type 3 glyph procedures, so an edited run
// cannot keep its original face. It is NOT lost: the edit path substitutes a
// standard font, so the characters survive.
test.describe("PDF text editor - Type 3 fonts", () => {
  test("editing a Type 3 run keeps the text, substituting a standard font", async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 30_000,
    });
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, "../test-fixtures/type3-sample.pdf"),
      );
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(800);

    const before = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__editor_store;
      const doc = s.doc ?? s.document;
      return doc.page(0).runs.map((r: any) => ({
        id: r.id,
        text: r.text,
        locked: r.locked,
      }));
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    const type3 = before.find((r: { text: string }) => r.text.includes("ab"));
    expect(type3).toBeTruthy();
    // A Type 3 run stays editable; locking it would remove working behaviour.
    expect(type3.locked).toBe(false);

    const target = page.locator(`[data-testid="pdf-editor-run-${type3.id}"]`);
    await target.click();
    await page.keyboard.press("End");
    await page.keyboard.type("Z");
    await page
      .locator('[data-testid="pdf-editor-page-0"]')
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(600);

    const after = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__editor_store;
      const doc = s.doc ?? s.document;
      return doc
        .page(0)
        .runs.map((r: any) => r.text)
        .join("|");
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(after).toContain("Z");
    // The ordinary run alongside it must be untouched.
    expect(after).toContain("Normal text");
  });

  // Sample.pdf is a Figma/Skia export: every font is Type 3, each visual line
  // is split across several of them, and most /Widths entries are 0. Reusing
  // those faces for an edit produced blank, zero-advance glyphs, so the
  // replaced line collapsed into an unreadable pile a few points wide.
  test("replacing a Type 3 line lays the glyphs out instead of stacking them", async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 30_000,
    });
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, "../../../../public/samples/Sample.pdf"),
      );
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1500);

    const NEXT = "An alternative to Adobe Acrobat";
    const target = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__editor_store;
      const run = s.document
        .page(0)
        .runs.find((r: any) => r.text.includes("The Free Adobe"));
      return run
        ? { id: run.id, fontSize: run.fontSize, width: run.bounds.width }
        : null;
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(target, "Sample.pdf tagline run").toBeTruthy();

    // Drive it the way a user does: select the line, replace it, click away.
    await page.locator(`[data-testid="pdf-editor-run-${target!.id}"]`).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.type(NEXT, { delay: 10 });
    await page
      .locator('[data-testid="pdf-editor-page-0"]')
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(1500);

    const after = await page.evaluate((id: string) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__editor_store;
      const run = s.document.page(0).runs.find((r: any) => r.id === id);
      return run ? { text: run.text, width: run.bounds.width } : null;
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }, target!.id);

    expect(after?.text).toBe(NEXT);
    // Every character must contribute an advance. The collapsed regression
    // measured ~0.09em per char; a real Latin line averages well over 0.3em.
    const visible = NEXT.replace(/\s+/gu, "").length;
    const minWidth = visible * target!.fontSize * 0.3;
    expect(
      after?.width ?? 0,
      `line width ${after?.width} is below ${minWidth}: glyphs stacked instead of advancing`,
    ).toBeGreaterThan(minWidth);
  });
});
