import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const MULTIPAGE_PDF = path.join(FIXTURES, "annotations_out_of_order.pdf");

test("the text editor opens a workbench file at the viewer's zoom", async ({
  page,
}) => {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(MULTIPAGE_PDF);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
  const readout = page.getByText(/%$/).first();
  const initialZoom = await readout.textContent();
  await page.getByRole("button", { name: "Zoom In" }).first().click();
  await expect(readout).not.toHaveText(initialZoom ?? "");
  const viewerZoom = await readout.textContent();

  await page
    .getByRole("link", { name: "PDF Text Editor", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId("pdf-editor-zoom-percent")).toHaveText(
    viewerZoom ?? "",
  );
});
