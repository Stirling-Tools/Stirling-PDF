import { test, expect } from "@app/tests/helpers/stub-test-base";

type P = import("@playwright/test").Page;

const nav = (page: P) =>
  page.getByRole("navigation", { name: /Quick navigation/i });
const rail = (page: P, name: RegExp) => nav(page).getByRole("button", { name });
const folderTree = (page: P) => page.getByRole("tree", { name: /Folders/i });

async function intoLibrary(page: P) {
  await rail(page, /^File library$/i).click();
  await expect(page).toHaveURL(/\/files/);
  await expect(folderTree(page)).toBeVisible({ timeout: 15_000 });
}

/**
 * Selecting a tool moves the address, and the library is the view the address
 * decides. Writing that address outside the router left react-router on /files,
 * so the reconciler that takes the view out of "myFiles" never ran: the tool was
 * selected, its panel stayed hidden behind the library, and both rail entries lit.
 */
test.describe("a tool picked from the file library opens", () => {
  test("the library gives way to the tool", async ({ page }) => {
    await intoLibrary(page);

    await rail(page, /^Automate$/i).click();

    await expect(page).toHaveURL(/\/automate/);
    await expect(folderTree(page)).toBeHidden();
    await expect(rail(page, /^File library$/i)).not.toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  // The address and the view disagreeing is what made Back land on /editor with
  // the library still on screen.
  test("back returns to the library", async ({ page }) => {
    await intoLibrary(page);
    await rail(page, /^Automate$/i).click();
    await expect(folderTree(page)).toBeHidden();

    await page.goBack();

    await expect(page).toHaveURL(/\/files/);
    await expect(folderTree(page)).toBeVisible();
    await expect(rail(page, /^File library$/i)).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
