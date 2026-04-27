import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * Routing & navigation behaviour for the SPA. Merges what was previously
 * `direct-url-navigation.spec.ts` and `browser-navigation.spec.ts` —
 * they overlapped ~30% (both verifying that tool routes resolve cleanly).
 */
test.describe("Navigation", () => {
  test("direct URLs load the matching tool page", async ({ page }) => {
    // We exercise a representative subset; `all-tool-pages-load.spec.ts`
    // does the exhaustive sweep across every registered tool.
    const targets = ["/merge", "/split", "/compress"];
    for (const url of targets) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(url));
      await expect(page.locator("body").first()).not.toBeEmpty();
    }
  });

  test("unknown routes do not crash or white-screen", async ({ page }) => {
    await page.goto("/nonexistent-page-12345");
    await page.waitForLoadState("domcontentloaded");
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
  });

  test("browser back / forward correctly traverses tool history", async ({
    page,
  }) => {
    // / → /merge → / → /split, then back/back/forward
    await page.locator('a[href="/merge"]').first().click();
    await expect(page).toHaveURL(/\/merge/);

    await page
      .getByRole("link", { name: /^Tools$/i })
      .first()
      .click();
    await expect(page).toHaveURL("/");

    await page.locator('a[href="/split"]').first().click();
    await expect(page).toHaveURL(/\/split/);

    await page.goBack();
    await expect(page).toHaveURL("/");

    await page.goBack();
    await expect(page).toHaveURL(/\/merge/);

    await page.goForward();
    await expect(page).toHaveURL("/");
  });
});
