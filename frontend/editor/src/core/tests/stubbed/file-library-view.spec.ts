import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * The file library is a view, not a route: which view is on screen is state, and the
 * path follows it. These pin the direction of that, because the reverse - the path
 * imposing the view on every render - used to make anything else set on /files
 * revert a render later.
 */
test.describe("The file library behaves like the other views", () => {
  // Scoped to the rail: the file sidebar carries a button of the same name.
  const railButton = (page: import("@playwright/test").Page, name: RegExp) =>
    page
      .getByRole("navigation", { name: /Quick navigation/i })
      .getByRole("button", { name });

  test("reading mode leaves the library instead of being reverted by it", async ({
    page,
  }) => {
    await page.goto("/editor");

    await railButton(page, /^File library$/i).click();
    await expect(page).toHaveURL(/\/files/);

    // Reader sets the viewer workbench. The path leaving /files is that view change
    // reaching the URL - which is what the old reconciler undid.
    await railButton(page, /^Reader$/i).click();
    await expect(page).not.toHaveURL(/\/files/);
    await expect(railButton(page, /^Reader$/i)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("going back from the library returns to the editor", async ({
    page,
  }) => {
    await page.goto("/editor");

    await railButton(page, /^File library$/i).click();
    await expect(page).toHaveURL(/\/files/);

    await page.goBack();
    await expect(page).not.toHaveURL(/\/files/);
  });

  test("a deep link to /files opens the library", async ({ page }) => {
    await page.goto("/files");
    await expect(page).toHaveURL(/\/files/);
    // Still there a beat later: nothing corrects the view back out from under it.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/files/);
  });
});
