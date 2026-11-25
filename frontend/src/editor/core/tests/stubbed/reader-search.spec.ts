import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

/**
 * Reading mode keeps search in the page bar, not the rail, so there is one
 * search button and one popover.
 */
test("search opens from the page bar while reading and finds matches", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator('[data-testid="file-input"]')
    .first()
    .setInputFiles(SAMPLE_PDF);
  await expect(page.getByText(/\/\s*1/).first()).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByRole("navigation", { name: /Quick navigation/i })
    .getByRole("button", { name: /^Reader$/i })
    .click();
  await expect(page).toHaveURL(/\/reader/);

  const toolbar = page.locator(".pdf-viewer-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Reading tools" })
      .getByRole("button", { name: "Search PDF" }),
  ).toHaveCount(0);

  await toolbar.getByRole("button", { name: "Search PDF" }).click();
  const field = page.getByPlaceholder("Enter search term...");
  await expect(field).toBeVisible();
  await field.fill("document");
  await field.press("Enter");
  await expect(page.getByText("of 2")).toBeVisible({ timeout: 10_000 });
});
