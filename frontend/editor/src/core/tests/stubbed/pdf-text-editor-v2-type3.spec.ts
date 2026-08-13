import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// PDFium's generator cannot emit Type 3 glyph procedures, so an edited run
// cannot keep its original face. It is NOT lost: the edit path substitutes a
// standard font, so the characters survive.
test.describe("PDF text editor v2 - Type 3 fonts", () => {
  test("editing a Type 3 run keeps the text, substituting a standard font", async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, "../test-fixtures/type3-sample.pdf"),
      );
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(800);

    const before = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__v2_editor_store;
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

    const target = page.locator(`[data-testid="v2-run-${type3.id}"]`);
    await target.click();
    await page.keyboard.press("End");
    await page.keyboard.type("Z");
    await page
      .locator('[data-testid="v2-page-0"]')
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(600);

    const after = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__v2_editor_store;
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
});
