import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Rewriting the editing host inside a `beforeinput` handler makes WebKit
// abandon the pending insertion: `input` never fires and the DOM never
// changes, so every edit is silently dropped. Chromium tolerates it, so this
// only shows up on WebKit - which is every browser on iOS.
test.describe("PDF text editor v2 - beforeinput must not mutate the DOM", () => {
  test("an inserted character reaches the DOM and the model", async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor?charcodeStrategy=content-stream", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, "../test-fixtures/cropbox-rotate90.pdf"),
      );
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(800);

    const id = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__v2_editor_store;
      return s.doc.page(0).runs[0]?.id ?? "";
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(id).toMatch(/^p0-/);

    await page.locator(`[data-testid="v2-run-${id}"]`).click();
    await page.waitForTimeout(150);

    const result = await page.evaluate((rid) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      )!;
      const events: string[] = [];
      el.addEventListener("beforeinput", () => events.push("beforeinput"));
      el.addEventListener("input", () => events.push("input"));
      el.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      const before = el.innerText;
      document.execCommand("insertText", false, "Z");
      return { before, after: el.innerText, events };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }, id);

    // The insertion must actually land: `input` firing is what carries it to
    // the model, and a cancelled beforeinput suppresses exactly that.
    expect(result.events).toContain("input");
    expect(result.after).not.toBe(result.before);
    expect(result.after).toContain("Z");

    await page.evaluate(
      (rid) =>
        document
          .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
          ?.blur(),
      id,
    );
    await page.waitForTimeout(600);

    const modelText = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__v2_editor_store;
      return s.doc.page(0).runs[0]?.text ?? "";
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(modelText).toContain("Z");
  });
});
