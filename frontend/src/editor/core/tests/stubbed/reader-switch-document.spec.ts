import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");

/**
 * The trigger sits inside the app Tooltip, so the click handler, ref and ARIA
 * attributes Menu.Target injects only reach the button if Tooltip passes them on.
 */
test("switch document opens the list and changes what is read", async ({
  page,
}) => {
  await uploadFiles(page, [
    path.join(FIXTURES, "compare_sample_a.pdf"),
    path.join(FIXTURES, "compare_sample_b.pdf"),
  ]);
  await page
    .getByRole("navigation", { name: /Quick navigation/i })
    .getByRole("button", { name: /^Reader$/i })
    .click();
  await expect(page).toHaveURL(/\/reader/);

  const rail = page.getByRole("navigation", { name: /Reading tools/i });
  const switchButton = rail.getByRole("button", { name: /Switch document/i });
  const documents = page.locator(".reader-rail__doc");
  const current = page.locator(".reader-rail__doc[data-current]");

  await expect(switchButton).toHaveAttribute("aria-haspopup", "menu");
  await switchButton.click();
  await expect(documents).toHaveCount(2, { timeout: 10_000 });
  await expect(switchButton).toHaveAttribute("aria-expanded", "true");
  const before = await current.innerText();

  await page.locator(".reader-rail__doc:not([data-current])").click();
  await expect(documents).toHaveCount(0);

  await switchButton.click();
  await expect(current).toHaveCount(1);
  await expect(current).not.toHaveText(before);
});
