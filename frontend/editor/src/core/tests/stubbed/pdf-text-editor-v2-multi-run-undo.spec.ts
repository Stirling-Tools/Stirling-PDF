import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Every toolbar action walks the selection and dispatches one command PER RUN.
// `deleteSelection` already knew that was wrong and wraps its commands in a
// CompositeCommand ("a 30-object delete must be a single undo step, not 30");
// the style actions never got the same treatment.
//
// It only became a visible bug once select-all reached the whole document and
// Ctrl+click could extend the selection again: restyle 200 runs and undo is
// 200 presses behind, so the first Ctrl+Z looks like the change had only
// landed on part of the document.
//
//   SetFontFamilyCommand - no coalesceKey at all, so N runs = N undo entries.
//   SetFontSizeCommand   - keys on `${pageIndex}:${runId}`, so it can never
//                          coalesce ACROSS runs either.
//
// SetColourCommand and SetTextOutlineCommand use run-independent keys, so they
// already collapse into one step - which is what the fixed ones must match.

const MANY_PAGES_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/many-pages-sample.pdf",
);

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
  fontId: string;
}

function runsInModel(
  page: import("@playwright/test").Page,
): Promise<RunView[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __v2_editor_store: {
        state: {
          pages: {
            pageIndex: number;
            runs: { id: string; fontSize: number; fontId: string }[];
          }[];
        };
      };
    };
    return w.__v2_editor_store.state.pages.flatMap((p) =>
      p.runs.map((r) => ({
        id: r.id,
        pageIndex: p.pageIndex,
        fontSize: r.fontSize,
        fontId: r.fontId,
      })),
    );
  });
}

/** Undo entries currently on the stack. */
function undoDepth(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __v2_editor_store: {
            history: { size(): { undo: number; redo: number } };
          };
        }
      ).__v2_editor_store.history.size().undo,
  );
}

async function selectAll(page: import("@playwright/test").Page) {
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(800);
  const selected = await page.evaluate(
    () =>
      (
        window as unknown as {
          __v2_editor_store: { selection: { value: { runIds: string[] } } };
        }
      ).__v2_editor_store.selection.value.runIds.length,
  );
  // The whole point is a MULTI-run selection; a one-run fixture proves nothing.
  expect(
    selected,
    "fixture must give select-all more than one run",
  ).toBeGreaterThan(1);
  return selected;
}

test.describe("v2 editor - a restyle of many runs is one undo step", () => {
  test("changing the font family over a select-all undoes in one press", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    // After select-all, not before: selecting is what reads the pages past the
    // eager window into the model, so an earlier snapshot would not know them.
    const selected = await selectAll(page);
    const before = await runsInModel(page);
    const familyBefore = new Map(before.map((r) => [r.id, r.fontId]));
    const depthBefore = await undoDepth(page);

    const picker = page.getByTestId("v2-font-family");
    await picker.click();
    await page.getByRole("option", { name: "Helvetica", exact: true }).click();
    await page.waitForTimeout(2500);

    // Sanity: the change has to have landed, or the undo assertion is vacuous.
    const changed = await runsInModel(page);
    expect(
      changed.filter((r) => /helvetica/i.test(r.fontId)).length,
      "the font change did not apply",
    ).toBeGreaterThan(1);

    const steps = (await undoDepth(page)) - depthBefore;
    expect(
      steps,
      `one toolbar click on ${selected} runs pushed ${steps} undo entries`,
    ).toBe(1);

    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(2000);

    const after = await runsInModel(page);
    const stuck = after.filter((r) => r.fontId !== familyBefore.get(r.id));
    expect(
      stuck.map((r) => `p${r.pageIndex}:${r.id}=${r.fontId}`),
      "one undo must put every run back, not just the last one touched",
    ).toEqual([]);
  });

  test("changing the font size over a select-all undoes in one press", async ({
    page,
  }) => {
    await openV2(page, MANY_PAGES_PDF);

    const selected = await selectAll(page);
    const before = await runsInModel(page);
    const sizeBefore = new Map(before.map((r) => [r.id, r.fontSize]));
    const depthBefore = await undoDepth(page);

    // fill() sets the value in one shot, so this is a single user edit and
    // any extra undo entries come from the per-run dispatch, not from typing.
    const sizeInput = page.getByTestId("v2-font-size");
    await sizeInput.fill("33");
    await sizeInput.blur();
    await page.waitForTimeout(2000);

    const changed = await runsInModel(page);
    expect(
      changed.filter((r) => Math.abs(r.fontSize - 33) < 0.5).length,
      "the size change did not apply",
    ).toBeGreaterThan(1);

    const steps = (await undoDepth(page)) - depthBefore;
    expect(
      steps,
      `one size change over ${selected} runs pushed ${steps} undo entries`,
    ).toBe(1);

    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(2000);

    const after = await runsInModel(page);
    const stuck = after.filter(
      (r) => Math.abs(r.fontSize - (sizeBefore.get(r.id) ?? -1)) > 0.5,
    );
    expect(
      stuck.map((r) => `p${r.pageIndex}:${r.id}@${r.fontSize}`),
      "one undo must restore every run's size",
    ).toEqual([]);
  });

  test("recolouring a select-all already undoes in one press", async ({
    page,
  }) => {
    // The control case: SetColourCommand's key ignores the run, so this path
    // was never broken. It pins the behaviour the other two must match.
    await openV2(page, MANY_PAGES_PDF);
    await selectAll(page);
    const depthBefore = await undoDepth(page);

    await page.getByTestId("v2-colour").fill("#c02020"); // theme-allow-color test input for the picker, not a UI colour
    await page.getByTestId("v2-colour").blur();
    await page.waitForTimeout(2000);

    const steps = (await undoDepth(page)) - depthBefore;
    expect(steps, `recolour pushed ${steps} undo entries`).toBe(1);
  });
});
