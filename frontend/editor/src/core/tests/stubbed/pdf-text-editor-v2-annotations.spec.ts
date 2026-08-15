import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// The canvas renders with FPDF_ANNOT but the editor model walks page objects
// only, so FreeText/widget/stamp text is visible and completely uneditable.
// It must at least be outlined and explained.
const ANNOT_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/annotation-text-sample.pdf",
);

test.describe("v2 editor - annotation-backed text is marked, not silently inert", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(ANNOT_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("widget and FreeText annotations get an outline with an explanation", async ({
    page,
  }) => {
    const outlines = page.locator('[data-testid^="v2-annot-p0-"]');
    await expect(outlines.first()).toBeAttached({ timeout: 15_000 });
    const count = await outlines.count();
    expect(count, "both annotations should be outlined").toBeGreaterThanOrEqual(
      2,
    );

    const kinds = await outlines.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-annot-kind")),
    );
    expect(kinds).toContain("widget");
    expect(kinds).toContain("freetext");

    // Every outline explains itself rather than being a mystery box.
    const labels = await outlines.evaluateAll((els) =>
      els.map((e) => e.getAttribute("title") ?? ""),
    );
    for (const label of labels) {
      expect(label.length, "outline needs a tooltip").toBeGreaterThan(10);
      expect(label).toContain("edited here");
    }
  });

  test("outlines sit over the annotation, not over the editable page text", async ({
    page,
  }) => {
    const outlines = page.locator('[data-testid^="v2-annot-p0-"]');
    await expect(outlines.first()).toBeAttached({ timeout: 15_000 });

    const editable = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: "Editable page text" })
      .first();
    await expect(editable).toBeAttached();
    const runBox = await editable.boundingBox();
    expect(runBox).not.toBeNull();

    const boxes = await outlines.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    for (const b of boxes) {
      expect(b.w).toBeGreaterThan(1);
      expect(b.h).toBeGreaterThan(1);
      // No outline may cover the editable run's box.
      const overlaps =
        b.x < runBox!.x + runBox!.width &&
        b.x + b.w > runBox!.x &&
        b.y < runBox!.y + runBox!.height &&
        b.y + b.h > runBox!.y;
      expect(overlaps, "annotation outline must not cover editable text").toBe(
        false,
      );
    }
  });

  test("the editable page text is still editable with annotations present", async ({
    page,
  }) => {
    const editable = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: "Editable page text" })
      .first();
    const tid = (await editable.getAttribute("data-testid")) ?? "";
    await page.evaluate((id) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${id}"]`,
      );
      if (!el) throw new Error("run missing");
      el.focus();
      const sel = window.getSelection();
      if (!sel) throw new Error("no selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, "!");
    }, tid);
    await page.waitForTimeout(200);

    const text = await page.evaluate((id) => {
      const w = window as unknown as {
        __v2_editor_store: {
          state: { pages: { runs: { id: string; text: string }[] }[] };
        };
      };
      for (const p of w.__v2_editor_store.state.pages) {
        for (const r of p.runs) if (`v2-run-${r.id}` === id) return r.text;
      }
      return "";
    }, tid);
    expect(text).toBe("Editable page text!");
  });
});
