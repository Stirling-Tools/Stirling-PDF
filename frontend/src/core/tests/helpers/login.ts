import { Page } from "@playwright/test";

/**
 * Ensure the cookie consent banner doesn't appear by setting the consent cookie.
 * Call this before navigating or after clearing cookies.
 */
export async function ensureCookieConsent(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "cc_cookie",
      value: JSON.stringify({
        categories: ["necessary"],
        revision: 0,
        data: null,
        rfc_cookie: false,
      }),
      domain: "localhost",
      path: "/",
    },
  ]);
}

/**
 * Mark onboarding as completed in localStorage to prevent the onboarding
 * modal from appearing. This is more reliable than trying to click through
 * the onboarding slides, which can cause unintended tool selections.
 *
 * Uses addInitScript so the localStorage is set before the React app reads it.
 */
export async function skipOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("onboarding::completed", "true");
    localStorage.setItem("onboarding::tours-tooltip-shown", "true");
  });
}

/**
 * Shared login helper for Stirling-PDF E2E tests.
 * Logs in with the given credentials and waits for the dashboard to load.
 *
 * Default credentials are `admin / adminadmin` — set by the live-setup
 * bootstrap spec, which performs the real first-login password change from
 * the backend's default `admin / stirling` (min 8 chars per
 * FirstLoginSlide validation).
 */
export const DEFAULT_TEST_USERNAME = "admin";
export const DEFAULT_TEST_PASSWORD = "adminadmin";

export async function login(
  page: Page,
  username = DEFAULT_TEST_USERNAME,
  password = DEFAULT_TEST_PASSWORD,
): Promise<void> {
  await ensureCookieConsent(page);
  // Skip onboarding before navigating so the modal never appears
  await skipOnboarding(page);
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Wait for the login form to render (React SPA may take a moment)
  await page.locator("#email").waitFor({ state: "visible", timeout: 15000 });

  // Fill in credentials (use input IDs — labels are localized and may not match)
  await page.locator("#email").fill(username);
  await page.locator("#password").fill(password);

  // Click Sign In (the submit button inside the auth form)
  await page.locator('button[type="submit"]').click();

  // Wait for redirect to home
  await page.waitForURL("/", { timeout: 15000 });
}

/**
 * Dismiss all startup dialogs (welcome + cookie consent + any others).
 * Uses Escape key to close overlays without triggering side effects.
 */
export async function dismissWelcomeDialog(page: Page): Promise<void> {
  // Give dialogs time to render
  await page.waitForTimeout(1000);

  // Try up to 5 times to dismiss all overlays via Escape
  for (let i = 0; i < 5; i++) {
    const hasOverlay = await page
      .locator(".mantine-Modal-overlay, .mantine-Overlay-root")
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasOverlay) break;

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
}

/**
 * Dismiss the cookie consent banner if it appears.
 * The banner is rendered inside #cc-main by the CookieConsent library.
 */
export async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    // Target buttons specifically inside the cookie consent container
    const ccMain = page.locator("#cc-main");
    const dismissBtn = ccMain
      .locator(
        'button:has-text("Tidak, terima kasih"), button:has-text("No Thanks"), button:has-text("Oke"), button:has-text("OK")',
      )
      .first();
    if (await dismissBtn.isVisible({ timeout: 2000 })) {
      await dismissBtn.click({ force: true });
      await page.waitForTimeout(500);
    }
  } catch {
    // No cookie consent banner present
  }
}

/**
 * Login and dismiss any welcome dialogs.
 */
export async function loginAndSetup(
  page: Page,
  username = DEFAULT_TEST_USERNAME,
  password = DEFAULT_TEST_PASSWORD,
): Promise<void> {
  await login(page, username, password);
  // Cookie consent may appear on top, dismiss it first
  await dismissCookieConsent(page);
  await dismissWelcomeDialog(page);
  // In case cookie appeared after welcome was dismissed
  await dismissCookieConsent(page);
}
