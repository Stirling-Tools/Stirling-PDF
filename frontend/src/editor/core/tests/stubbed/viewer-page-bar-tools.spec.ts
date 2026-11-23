import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

/**
 * A page bar too narrow for every control folds pan, ruler and read aloud
 * into a Tools menu rather than wrapping onto a second row. A tool switched
 * on from there stays folded, shown on the menu's own button.
 */
test("a narrow page bar folds its tools into a menu and stays on one row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1250, height: 900 });
  await page.goto("/");
  await page
    .locator('[data-testid="file-input"]')
    .first()
    .setInputFiles(SAMPLE_PDF);
  await expect(page.getByText(/\/\s*1/).first()).toBeVisible({
    timeout: 30_000,
  });

  const toolbar = page.locator(".pdf-viewer-toolbar");
  const oneRow = async () => ((await toolbar.boundingBox())?.height ?? 0) < 60;
  const menu = page.getByTestId("viewer-page-tools-menu");
  await expect(menu).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Pan Mode" })).toBeHidden();
  expect(await oneRow()).toBe(true);

  await menu.click();
  // Rotation folds in with the tools rather than leaving the narrow bar.
  await expect(
    page.getByRole("menuitem", { name: "Rotate Left" }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Pan Mode" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Pan Mode" }),
  ).toHaveAttribute("data-checked", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("data-variant", "filled");
  expect(await oneRow()).toBe(true);
});
