import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

type P = import("@playwright/test").Page;
const rail = (p: P, name: RegExp) =>
  p
    .getByRole("navigation", { name: /Quick navigation/i })
    .getByRole("button", { name });

/**
 * The picker lives in the file sidebar, which reading unmounts along with the
 * rest of the wing. Quick navigation still offers it there, so the request has to
 * outlive the unmount rather than land on nothing - and still count as the same
 * user gesture, or the browser refuses to open the dialog.
 */
test("open from computer opens the picker while reading", async ({ page }) => {
  await rail(page, /^Reader$/i).click();
  await expect(page).toHaveURL(/\/reader/);
  await expect(page.locator('[data-testid="file-input"]')).toHaveCount(0);

  // The event only fires when the browser really opens a chooser.
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
  await page.getByTestId("files-button").click();
  await chooser;

  await page.locator('[data-testid="file-input"]').setInputFiles([SAMPLE_PDF]);
  await expect(page.locator(".file-sidebar-file-item").first()).toBeVisible({
    timeout: 10_000,
  });
});
