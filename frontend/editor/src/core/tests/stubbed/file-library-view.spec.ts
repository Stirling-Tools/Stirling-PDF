import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { dismissTourTooltip, uploadFiles } from "@app/tests/helpers/ui-helpers";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

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
    const library = railButton(page, /^File library$/i);
    await expect(library).toBeVisible({ timeout: 15_000 });
    await expect(library).not.toHaveAttribute("aria-current", "true");

    await library.click();
    await expect(page.getByRole("tree", { name: /Folders/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(library).toHaveAttribute("aria-current", "true");

    // The editor entry pairs off with the processor, so a build without one ships
    // neither: where it is on screen, the library takes the marker off it.
    const editor = railButton(page, /^Editor$/i);
    if ((await editor.count()) > 0) {
      await expect(editor).not.toHaveAttribute("aria-current", "true");
    }
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

  /** The library is a view, so reaching it runs the same unsaved-changes check a view
   *  switch runs. Asking a second time around that one leaves the confirm with nothing
   *  to act on: the prompt closes and the click is swallowed. */
  test("discarding unsaved changes opens the library on the first ask", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await uploadFiles(page, SAMPLE_PDF);
    await dismissTourTooltip(page);
    await page.getByText("PDF Multi Tool", { exact: true }).first().click();
    const firstPage = page.locator("[data-page-id]").first();
    await expect(firstPage).toBeVisible({ timeout: 60_000 });
    await firstPage.hover();
    await firstPage.getByRole("button", { name: "Rotate Right" }).click();

    await railButton(page, /^File library$/i).click();
    await expect(page.getByTestId("unsaved-discard")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("unsaved-discard").click();

    await expect(page.getByRole("tree", { name: /Folders/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/files/);
  });
});
