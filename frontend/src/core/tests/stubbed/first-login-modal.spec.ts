import { test, expect, type Page } from "@playwright/test";
import { mockAppApis, seedCookieConsent } from "@app/tests/helpers/api-stubs";

/**
 * The InitialOnboardingModal opens to the FirstLoginSlide when the
 * proprietary `/account` endpoint reports `changeCredsFlag: true`.
 *
 * IMPORTANT: this spec uses raw @playwright/test rather than the shared
 * stub-test-base fixture because the fixture sets onboarding::completed
 * in localStorage, which suppresses the very modal we're testing.
 */

async function setUpFirstLoginPage(page: Page) {
  await seedCookieConsent(page);
  // Seed a JWT in localStorage so hasAuthToken() returns true and the
  // orchestrator's checkFirstLogin effect actually fires.
  await page.addInitScript(() => {
    localStorage.setItem(
      "stirling_jwt",
      // Minimal JWT-shape value — the proprietary client only checks presence
      // before deciding to call /account, then trusts the API mocks.
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature",
    );
  });
  // Note: deliberately NOT calling skipOnboarding here.
  await mockAppApis(page, {
    enableLogin: true,
    user: {
      id: 1,
      username: "admin",
      email: "admin",
      roles: ["ROLE_ADMIN"],
    },
  });
  await page.route("**/api/v1/proprietary/ui-data/account", (route) =>
    route.fulfill({
      json: {
        username: "admin",
        email: "admin",
        changeCredsFlag: true,
        isAdmin: true,
        isSso: false,
        isMfaEnabled: false,
        mfaRequired: false,
        settings: { mfaRequired: false },
      },
    }),
  );
  await page.route("**/api/v1/proprietary/ui-data/login", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        loginMethod: "all",
        showDefaultCredentials: true,
      },
    }),
  );
}

test.describe("First-login forced password change modal", () => {
  test("modal renders with FirstLoginSlide content", async ({ page }) => {
    await setUpFirstLoginPage(page);
    await page.goto("/");

    await expect(
      page.getByText(/must change your password|set your password/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    const submit = page.getByRole("button", { name: /change password/i });
    await expect(submit).toBeDisabled();
  });

  test("Escape does not close the modal (non-dismissible)", async ({
    page,
  }) => {
    await setUpFirstLoginPage(page);
    await page.goto("/");
    await expect(
      page.getByText(/must change your password|set your password/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await expect(
      page.getByText(/must change your password|set your password/i).first(),
    ).toBeVisible();
  });

  test("submitting valid passwords calls change-password endpoint", async ({
    page,
  }) => {
    let captured = false;
    await setUpFirstLoginPage(page);
    await page.route(
      "**/api/v1/user/change-password-on-login",
      async (route) => {
        captured = true;
        await route.fulfill({ status: 200, body: "" });
      },
    );

    await page.goto("/");
    await expect(
      page.getByText(/must change your password|set your password/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page
      .getByPlaceholder(/enter new password.*characters/i)
      .fill("adminadmin");
    await page.getByPlaceholder(/re-enter new password/i).fill("adminadmin");

    const submit = page.getByRole("button", { name: /change password/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect.poll(() => captured, { timeout: 5_000 }).toBe(true);
  });
});
