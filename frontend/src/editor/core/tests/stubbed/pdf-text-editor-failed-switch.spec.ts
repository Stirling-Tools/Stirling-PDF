import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import {
  openInTextEditor,
  showInTextEditor,
} from "@editor/tests/helpers/pdf-text-editor";

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

  await showInTextEditor(page, IMAGE);

  // Saving now would write sample.pdf's pages over the image.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __editor_store?: { document: unknown } })
              .__editor_store?.document ?? null,
        ),
      { timeout: 30_000 },
    )
    .toBeNull();
  await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
});
