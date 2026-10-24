import type { Page } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * Self-hosted has no self-service signup: accounts are created by an admin
 * (`/api/v1/user/register` is not a public endpoint, so the old page could
 * never have worked anonymously). The login screen must not advertise it and
 * `/signup` must not render a signup form.
 */
test.describe("Self-hosted signup surface", () => {
  test.use({
    stubOptions: { enableLogin: true },
    autoGoto: false,
  });

  const stubLoginUiData = async (page: Page) => {
    await page.route("**/api/v1/proprietary/ui-data/login", (route) =>
      route.fulfill({
        json: {
          enableLogin: true,
          loginMethod: "all",
          providerList: {},
          ssoAutoLogin: false,
          firstTimeSetup: false,
          showDefaultCredentials: false,
        },
      }),
    );
  };

  test("login page offers no sign-up link", async ({ page }) => {
    await stubLoginUiData(page);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText(/don't have an account/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign up/i })).toHaveCount(0);
  });

  test("/signup redirects to login instead of rendering a signup form", async ({
    page,
  }) => {
    await stubLoginUiData(page);

    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toBeVisible({ timeout: 10_000 });

    await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
    await expect(page.locator("#confirmPassword")).toHaveCount(0);
  });
});
