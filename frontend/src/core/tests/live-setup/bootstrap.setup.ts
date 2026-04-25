import { test, expect } from "@app/tests/helpers/test-base";
import {
  ensureCookieConsent,
  skipOnboarding,
  DEFAULT_TEST_USERNAME,
  DEFAULT_TEST_PASSWORD,
} from "@app/tests/helpers/login";

/**
 * Live-suite bootstrap. Two responsibilities:
 *
 *   1. **Pristine CI path** — log in as the backend's default
 *      `admin / stirling` user (created with firstLogin=true), exercise
 *      the FirstLoginSlide UI, change to `admin / adminadmin`, verify
 *      the post-change toast. Real coverage of the forced-first-login
 *      flow.
 *
 *   2. **Already-seeded path** — for local dev where `admin / adminadmin`
 *      already exists (e.g. the developer's settings.yml provisions it
 *      directly), the bootstrap is a no-op pass. We detect this by
 *      attempting the API login first; if it returns 200 we skip the
 *      UI flow.
 *
 * Configured as a Playwright `setup` project; the `live` project
 * depends on it so it runs once before every other live spec.
 */

const DEFAULT_BACKEND_PASSWORD = "stirling";

async function adminAdminadminAlreadyExists(
  request: import("@playwright/test").APIRequestContext,
): Promise<boolean> {
  const res = await request
    .post("/api/v1/auth/login", {
      data: {
        username: DEFAULT_TEST_USERNAME,
        password: DEFAULT_TEST_PASSWORD,
      },
    })
    .catch(() => null);
  return res?.ok() ?? false;
}

test.describe("Live-suite bootstrap", () => {
  test("first-login: change default admin/stirling to admin/adminadmin", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);

    // Already-seeded local case — skip the UI flow.
    if (await adminAdminadminAlreadyExists(request)) {
      test.info().annotations.push({
        type: "bootstrap",
        description:
          "admin/adminadmin already provisioned (local-dev path); skipping forced-first-login UI flow",
      });
      return;
    }

    await ensureCookieConsent(page);
    await skipOnboarding(page);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator("#email").waitFor({ state: "visible", timeout: 15_000 });

    await page.locator("#email").fill(DEFAULT_TEST_USERNAME);
    await page.locator("#password").fill(DEFAULT_BACKEND_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(
      page.getByText(/must change your password|set your password/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    const newPasswordInput = page.getByLabel(/^new password$/i);
    const confirmPasswordInput = page.getByLabel(/confirm new password/i);
    await newPasswordInput.fill(DEFAULT_TEST_PASSWORD);
    await confirmPasswordInput.fill(DEFAULT_TEST_PASSWORD);

    const submitBtn = page.getByRole("button", { name: /change password/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(
      page.getByText(/password changed successfully/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // After success the user is signed out; expect redirect back to /login
    await page.waitForURL(/\/login(\?.*)?$/, { timeout: 15_000 });

    // Confirm the new credentials work via the API
    const verify = await request.post("/api/v1/auth/login", {
      data: {
        username: DEFAULT_TEST_USERNAME,
        password: DEFAULT_TEST_PASSWORD,
      },
    });
    expect(verify.ok()).toBeTruthy();
  });
});
