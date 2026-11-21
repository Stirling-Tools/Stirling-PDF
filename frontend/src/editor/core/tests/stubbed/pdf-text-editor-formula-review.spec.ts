import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
import { formulasPdf } from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// A formula drawn as text needs a description as much as one drawn as an
// image: without one a PDF/UA checker fails it, so the review must find it.

test("an undescribed text formula is flagged, reached by Next, and cleared by describing it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openInTextEditor(page, {
    name: "formulas.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(formulasPdf()),
  });
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });

  const badges = page.locator('[data-testid^="pdf-editor-attention-run-"]');
  await expect(badges).toHaveCount(1);
  await badges.first().hover();
  await expect(
    page.getByRole("tooltip", { name: "No description" }),
  ).toBeVisible();

  await page.getByTestId("pdf-editor-tab-document").click();
  const summary = page.getByTestId("pdf-editor-document-accessibility-summary");
  await expect(summary).toHaveText(/Missing descriptions\s*1/);

  await page.getByTestId("pdf-editor-document-accessibility-next").click();
  const field = page.getByTestId("pdf-editor-text-description");
  await expect(field).toHaveValue("");
  // The only one: nothing else to move on to.
  await expect(
    page.getByTestId("pdf-editor-text-description-next"),
  ).toBeHidden();

  await field.fill("a equals b, c equals d");
  await expect(badges).toHaveCount(0);
  await page.getByTestId("pdf-editor-tab-document").click();
  await expect(summary).toHaveText(/Missing descriptions\s*0/);
  await expect(
    page.getByTestId("pdf-editor-document-accessibility-next"),
  ).toBeHidden();
});
