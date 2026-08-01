import { test, expect, type Page, type Route } from "@playwright/test";
import {
  mockAppApis,
  seedCookieConsent,
  skipOnboarding,
} from "@app/tests/helpers/api-stubs";

/**
 * The LoginAgreementModal (AppLayout) shows a blocking Accept/Decline disclaimer after login
 * (and on launch in anonymous mode). Text comes from GET /api/v1/config/login-disclaimer for the
 * current language, rendered as markdown; acceptance is remembered per login for the tab session.
 */

const MARKDOWN = "## Test Disclaimer\n\nThis is **mandatory** reading.";

interface DisclaimerStub {
  enabled?: boolean;
  showInAnonymousMode?: boolean;
  content?: string;
}

async function stubDisclaimer(page: Page, opts: DisclaimerStub = {}) {
  const {
    enabled = true,
    showInAnonymousMode = true,
    content = MARKDOWN,
  } = opts;
  await page.route("**/api/v1/config/login-disclaimer*", (route: Route) =>
    route.fulfill({
      json: { enabled, showInAnonymousMode, content, format: "markdown" },
    }),
  );
}

async function setUpLoggedIn(page: Page, disclaimer: DisclaimerStub = {}) {
  await seedCookieConsent(page);
  await skipOnboarding(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "stirling_jwt",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature",
    );
  });
  await mockAppApis(page, {
    enableLogin: true,
    user: { id: 1, username: "admin", email: "admin", roles: ["ROLE_ADMIN"] },
  });
  await stubDisclaimer(page, disclaimer);
}

test.describe("Login agreement modal", () => {
  test("shows a blocking disclaimer with rendered markdown after login", async ({
    page,
  }) => {
    await setUpLoggedIn(page);
    await page.goto("/");

    await expect(
      page.getByText("Login Agreement", { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
    // Markdown is rendered (heading + bold), not shown as raw text.
    await expect(
      page.getByRole("heading", { name: "Test Disclaimer" }),
    ).toBeVisible();
    await expect(page.getByText("mandatory")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();
  });

  test("Escape does not dismiss the modal (blocking)", async ({ page }) => {
    await setUpLoggedIn(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Test Disclaimer" }),
    ).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await expect(
      page.getByRole("heading", { name: "Test Disclaimer" }),
    ).toBeVisible();
  });

  test("Accept dismisses and it does not reappear on reload (once per login)", async ({
    page,
  }) => {
    await setUpLoggedIn(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Test Disclaimer" }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Accept" }).click();
    await expect(
      page.getByRole("heading", { name: "Test Disclaimer" }),
    ).toBeHidden();

    await page.reload();
    await page.waitForTimeout(1000);
    await expect(
      page.getByRole("heading", { name: "Test Disclaimer" }),
    ).toBeHidden();
  });

  test("does not show when the feature is disabled", async ({ page }) => {
    await setUpLoggedIn(page, { enabled: false, content: "" });
    await page.goto("/");
    // App is usable; modal never appears.
    await page.waitForTimeout(1500);
    await expect(
      page.getByRole("heading", { name: "Test Disclaimer" }),
    ).toBeHidden();
  });

  test("shows in anonymous (no-login) mode when allowed", async ({ page }) => {
    await seedCookieConsent(page);
    await skipOnboarding(page);
    await mockAppApis(page, { enableLogin: false });
    await stubDisclaimer(page, { showInAnonymousMode: true });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Test Disclaimer" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("does not show in anonymous mode when suppressed", async ({ page }) => {
    await seedCookieConsent(page);
    await skipOnboarding(page);
    await mockAppApis(page, { enableLogin: false });
    await stubDisclaimer(page, { showInAnonymousMode: false });
    await page.goto("/");

    await page.waitForTimeout(1500);
    await expect(
      page.getByRole("heading", { name: "Test Disclaimer" }),
    ).toBeHidden();
  });
});
