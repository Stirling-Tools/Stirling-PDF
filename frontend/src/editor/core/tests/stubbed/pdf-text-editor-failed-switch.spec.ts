import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const IMAGE = path.join(import.meta.dirname, "../test-fixtures/sample.png");

test("a file the editor cannot open does not keep the previous document", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openInTextEditor(page, SAMPLE_PDF);

  await page.getByTestId("file-input").setInputFiles(IMAGE);
  const row = page
    .locator(".file-sidebar-file-item")
    .filter({ hasText: "sample.png" })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.hover();
  await row.locator(".file-sidebar-eye-btn").click();

  // Saving now would write sample.pdf's pages over the image.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __editor_store?: { document: unknown } })
            .__editor_store?.document ?? null,
      ),
    )
    .toBeNull();
  await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
});
