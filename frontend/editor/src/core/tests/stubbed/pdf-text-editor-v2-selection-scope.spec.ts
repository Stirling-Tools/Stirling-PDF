import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Two ways the editor's selection covered less than the user asked for:
//
//   * The loader only reads text for the first EAGER_PAGE_LIMIT (5) pages;
//     the rest stay empty until they scroll into view. Ctrl+A collected run
//     ids straight out of that half-filled model, so "select all" quietly
//     stopped at page 5 and a font change applied to only part of the file.
//   * Ctrl+click was swallowed whole by the ctrl-drag move gesture, whose
//     pointerup bails out below a 0.5px threshold - so a Ctrl+click that
//     didn't move was a no-op and could not extend the selection.

const MANY_PAGES_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/many-pages-sample.pdf",
);
const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

// Pages 6-8 of the fixture are past the eager window on purpose.
const TOTAL_PAGES = 8;

async function openV2(page: import("@playwright/test").Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

interface RunView {
  id: string;
  pageIndex: number;
  fontSize: number;
  selected: boolean;
}

/** Every run the model currently holds, tagged with its selection state. */
function runsInModel(
  page: import("@playwright/test").Page,
): Promise<RunView[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __v2_editor_store: {
        state: {
          pages: {
            pageIndex: number;
            runs: { id: string; fontSize: number }[];
          }[];
        };
        selection: { value: { runIds: string[] } };
      };
    };
    const store = w.__v2_editor_store;
    const selected = new Set(store.selection.value.runIds);
    return store.state.pages.flatMap((p) =>
      p.runs.map((r) => ({
        id: r.id,
        pageIndex: p.pageIndex,
        fontSize: r.fontSize,
        selected: selected.has(r.id),
      })),
    );
  });
}

test.describe("v2 editor - select all covers the whole document", () => {
  test("Ctrl+A selects runs on pages past the eager read window", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    // Nothing has scrolled, so only the eager pages have been read. This is
    // the precondition that made the bug invisible on short documents.
    const before = await runsInModel(page);
    const readBefore = new Set(before.map((r) => r.pageIndex));
    expect(
      readBefore.size,
      "fixture must be longer than the eager read window",
    ).toBeLessThan(TOTAL_PAGES);

    await page.keyboard.press("Control+a");
    await page.waitForTimeout(800);

    const after = await runsInModel(page);
    const selectedPages = new Set(
      after.filter((r) => r.selected).map((r) => r.pageIndex),
    );
    expect(
      [...selectedPages].sort((a, b) => a - b),
      "select all must reach every page, not just the ones already read",
    ).toEqual([...Array(TOTAL_PAGES).keys()]);
    // And it must select every run it reached, not a sample of them.
    expect(after.every((r) => r.selected)).toBe(true);
  });

  test("select all then change font size applies to the whole document", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);
    await page.keyboard.press("Control+a");
    await page.waitForTimeout(800);

    // The reported symptom: the change landed on some lines and not others.
    const sizeInput = page.getByTestId("v2-font-size");
    await sizeInput.fill("33");
    await sizeInput.blur();
    await page.waitForTimeout(1500);

    const runs = await runsInModel(page);
    expect(
      runs.length,
      "every page's text should be in the model",
    ).toBeGreaterThan(0);
    const missed = runs.filter((r) => Math.abs(r.fontSize - 33) > 0.5);
    expect(
      missed.map((r) => `p${r.pageIndex}:${r.id}@${r.fontSize}`),
      "no run may keep its old size",
    ).toEqual([]);
    expect(new Set(runs.map((r) => r.pageIndex)).size).toBe(TOTAL_PAGES);
  });
});

test.describe("v2 editor - Ctrl+click extends the selection", () => {
  test("Ctrl+clicking a second run selects both", async ({ page }) => {
    await openV2(page, PARAGRAPH_PDF);
    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    expect(
      await runs.count(),
      "fixture needs at least two runs to multi-select",
    ).toBeGreaterThan(1);

    const first = runs.nth(0);
    const second = runs.nth(1);
    await first.click();
    await page.waitForTimeout(300);
    const firstId = (await first.getAttribute("data-testid"))!.replace(
      "v2-run-",
      "",
    );

    // Ctrl+click with no drag: used to start a move gesture that cancelled
    // itself on pointerup, leaving the selection untouched.
    await second.click({ modifiers: ["Control"] });
    await page.waitForTimeout(300);
    const secondId = (await second.getAttribute("data-testid"))!.replace(
      "v2-run-",
      "",
    );

    const selected = await page.evaluate(() => {
      const w = window as unknown as {
        __v2_editor_store: { selection: { value: { runIds: string[] } } };
      };
      return w.__v2_editor_store.selection.value.runIds;
    });
    expect([...selected].sort()).toEqual([firstId, secondId].sort());
  });

  test("Ctrl+clicking a selected run deselects it again", async ({ page }) => {
    await openV2(page, PARAGRAPH_PDF);
    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const first = runs.nth(0);
    const second = runs.nth(1);
    // Build the two-run selection with Shift, which always worked, so the
    // assertion below is about Ctrl+click removing a run - not adding one.
    await first.click();
    await second.click({ modifiers: ["Shift"] });
    await page.waitForTimeout(300);
    const both = await page.evaluate(() => {
      const w = window as unknown as {
        __v2_editor_store: { selection: { value: { runIds: string[] } } };
      };
      return w.__v2_editor_store.selection.value.runIds;
    });
    expect(both, "Shift+click should have selected two runs").toHaveLength(2);

    await second.click({ modifiers: ["Control"] });
    await page.waitForTimeout(300);

    const firstId = (await first.getAttribute("data-testid"))!.replace(
      "v2-run-",
      "",
    );
    const selected = await page.evaluate(() => {
      const w = window as unknown as {
        __v2_editor_store: { selection: { value: { runIds: string[] } } };
      };
      return w.__v2_editor_store.selection.value.runIds;
    });
    expect(selected).toEqual([firstId]);
  });
});
