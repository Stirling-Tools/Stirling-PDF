import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * The file library is a view, not a route: which view is on screen is state, and the
 * path follows it. These pin the direction of that, because the reverse - the path
 * imposing the view on every render - makes anything else set on /files revert a
 * render later.
 */
test.describe("The file library behaves like the other views", () => {
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
    // The path leads the view by a render, so wait for the library itself: clicking
    // the next control before it mounts races its own arrival.
    await expect(page.getByRole("tree", { name: /Folders/i })).toBeVisible({
      timeout: 15_000,
    });

    // Reader sets the viewer workbench. The path leaving /files is that view change
    // reaching the URL - which is what the old reconciler undid.
    await railButton(page, /^Reader$/i).click();
    await expect(page).not.toHaveURL(/\/files/);
    await expect(railButton(page, /^Reader$/i)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("the rail marks the library, not the editor it sits in", async ({
    page,
  }) => {
    await page.goto("/editor");
    await expect(railButton(page, /^Editor$/i)).toHaveAttribute(
      "aria-current",
      "true",
    );

    await railButton(page, /^File library$/i).click();
    await expect(page.getByRole("tree", { name: /Folders/i })).toBeVisible({
      timeout: 15_000,
    });

    await expect(railButton(page, /^File library$/i)).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(railButton(page, /^Editor$/i)).not.toHaveAttribute(
      "aria-current",
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

  test("a deep link to /files opens the library and keeps it", async ({
    page,
  }) => {
    await page.goto("/files");
    const tree = page.getByRole("tree", { name: /Folders/i });
    await expect(tree).toBeVisible({ timeout: 15_000 });

    // Arriving is the easy half. The view also has to survive the renders that
    // follow, which is where a second opinion about which view belongs on screen
    // would replace it - leaving the path saying library and the screen not.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/files/);
    await expect(tree).toBeVisible();
  });
});
