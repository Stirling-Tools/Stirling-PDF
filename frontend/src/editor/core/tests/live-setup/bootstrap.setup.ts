import { test, expect } from "@editor/tests/helpers/test-base";
import {
  ensureCookieConsent,
  skipOnboarding,
  DEFAULT_TEST_USERNAME,
  DEFAULT_TEST_PASSWORD,
} from "@editor/tests/helpers/login";

/** Runs once before the live suite: sets admin/adminadmin on a fresh server's
 *  account card (or reuses a seeded one), then marks setup complete. */

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
