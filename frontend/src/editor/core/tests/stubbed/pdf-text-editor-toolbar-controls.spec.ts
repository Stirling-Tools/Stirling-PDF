import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Two toolbar changes:
//
//   * The bold button was a second, weaker way to say what the font family
//     picker already says, and it applied to whole runs rather than to the
//     text the user had selected. The weight control is gone; Helvetica Bold
//     and friends are still one dropdown pick away.
//   * Fill colour and outline colour sat side by side, so the common case
//     (change the text colour) had two pickers to choose between. Outline
//     colour and width now live behind an advanced control.

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
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

/** Select the first run and hand back its id. */
async function selectFirstRun(page: import("@playwright/test").Page) {
  const run = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
  await run.click();
  await page.waitForTimeout(300);
  return (await run.getAttribute("data-testid"))!.replace(
    "pdf-editor-run-",
    "",
  );
}

function readRun(page: import("@playwright/test").Page, runId: string) {
  return page.evaluate((rid) => {
    const w = window as unknown as {
      __editor_store: {
        state: {
          pages: {
            runs: { id: string; fontId: string; strokeWidth?: number }[];
          }[];
        };
      };
    };
    for (const p of w.__editor_store.state.pages) {
      const r = p.runs.find((x) => x.id === rid);
      if (r) return { fontId: r.fontId, strokeWidth: r.strokeWidth ?? 0 };
    }
    return null;
  }, runId);
}

test.describe("PDF text editor - the weight control is gone", () => {
  test("the toolbar has no bold button", async ({ page }) => {
    await openEditor(page, PARAGRAPH_PDF);
    await selectFirstRun(page);
    await expect(page.getByTestId("pdf-editor-toolbar")).toBeVisible();
    await expect(
      page.getByTestId("pdf-editor-bold"),
      "the bold weight control should have been dropped",
    ).toHaveCount(0);
    // Italic is a style, not a weight, and stays.
    await expect(page.getByTestId("pdf-editor-italic")).toBeVisible();
  });

  test("bold is still reachable through the font family picker", async ({
    page,
  }) => {
    await openEditor(page, PARAGRAPH_PDF);
    const runId = await selectFirstRun(page);
    const before = await readRun(page, runId);
    expect(before, "run should be in the model").not.toBeNull();

    await page.getByTestId("pdf-editor-font-family").click();
    await page.getByRole("option", { name: "Helvetica Bold" }).click();
    await page.waitForTimeout(600);

    const after = await readRun(page, runId);
    expect(after!.fontId).toMatch(/Helvetica-Bold/);
  });
});

test.describe("PDF text editor - one colour picker by default", () => {
  test("outline colour and width are not in the toolbar", async ({ page }) => {
    await openEditor(page, PARAGRAPH_PDF);
    await selectFirstRun(page);

    await expect(page.getByTestId("pdf-editor-colour")).toBeVisible();
    await expect(
      page.getByTestId("pdf-editor-outline-colour"),
      "outline colour belongs behind the advanced control",
    ).toHaveCount(0);
    await expect(page.getByTestId("pdf-editor-outline-width")).toHaveCount(0);
    await expect(page.getByTestId("pdf-editor-colour-advanced")).toBeVisible();
  });

  test("the advanced control opens the fill/stroke pair and it still works", async ({
    page,
  }) => {
    await openEditor(page, PARAGRAPH_PDF);
    const runId = await selectFirstRun(page);

    await page.getByTestId("pdf-editor-colour-advanced").click();
    await expect(page.getByTestId("pdf-editor-outline-colour")).toBeVisible();
    const width = page.getByTestId("pdf-editor-outline-width");
    await expect(width).toBeVisible();

    await width.fill("2");
    await width.press("Enter");
    await page.waitForTimeout(800);

    const after = await readRun(page, runId);
    expect(after!.strokeWidth).toBeCloseTo(2, 1);
  });
});
