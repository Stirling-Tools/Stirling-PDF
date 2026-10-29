import { test, expect } from "@editor/tests/helpers/test-base";
import {
  ensureCookieConsent,
  skipOnboarding,
  DEFAULT_TEST_USERNAME,
  DEFAULT_TEST_PASSWORD,
} from "@editor/tests/helpers/login";

/**
 * Live-suite bootstrap. Two responsibilities:
 *
 *   1. **Pristine CI path** — a fresh server signs its default
 *      `admin / stirling` user in by itself and opens first-run setup on
 *      the account card. Set `admin / adminadmin` there, then mark the rest
 *      of setup complete through the API: setup has no skip, and finishing
 *      it in the UI would restart the server under the suite. Real coverage
 *      of the account card, and the API call proves the new password took.
 *
 *   2. **Already-seeded path** — for local dev where `admin / adminadmin`
 *      already exists (e.g. the developer's settings.yml provisions it
 *      directly), skip the UI flow and only mark setup complete through the
 *      API, so the wizard does not stand in front of every other live spec.
 *
 * Configured as a Playwright `setup` project; the `live` project
 * depends on it so it runs once before every other live spec.
 */

async function signInSeededAdmin(
  request: import("@playwright/test").APIRequestContext,
): Promise<string | null> {
  const res = await request
    .post("/api/v1/auth/login", {
      data: {
        username: DEFAULT_TEST_USERNAME,
        password: DEFAULT_TEST_PASSWORD,
      },
    })
    .catch(() => null);
  if (!res?.ok()) return null;
  const body = await res.json();
  return body?.session?.access_token ?? null;
}

test.describe("Live-suite bootstrap", () => {
  test("first-run setup: change default admin/stirling to admin/adminadmin", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);

    const seededToken = await signInSeededAdmin(request);
    if (seededToken) {
      const done = await request.post("/api/v1/admin/settings/setup-complete", {
        headers: { Authorization: `Bearer ${seededToken}` },
      });
      expect(done.ok()).toBeTruthy();
      test.info().annotations.push({
        type: "bootstrap",
        description:
          "admin/adminadmin already provisioned (local-dev path); skipping first-run setup UI flow",
      });
      return;
    }

    await ensureCookieConsent(page);
    await skipOnboarding(page);

    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Set up your account").first()).toBeVisible({
      timeout: 20_000,
    });

    await page
      .getByRole("textbox", { name: "Username", exact: true })
      .fill(DEFAULT_TEST_USERNAME);
    await page
      .getByRole("textbox", { name: "New password", exact: true })
      .fill(DEFAULT_TEST_PASSWORD);
    await page
      .getByRole("textbox", { name: "Confirm new password", exact: true })
      .fill(DEFAULT_TEST_PASSWORD);
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByText("Your server is up").first()).toBeVisible({
      timeout: 15_000,
    });

    const token = await signInSeededAdmin(request);
    expect(token).not.toBeNull();
    const done = await request.post("/api/v1/admin/settings/setup-complete", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(done.ok()).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Your server is up")).toHaveCount(0, {
      timeout: 15_000,
    });
  });
});
