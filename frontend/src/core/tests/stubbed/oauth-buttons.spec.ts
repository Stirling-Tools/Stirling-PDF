import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * When app-config advertises OAuth providers the login screen renders
 * a "Continue with X" button per provider. This is the entry-point
 * customers depend on — a config drift that drops the button means
 * SSO becomes silently unreachable from the UI.
 */
test.describe("OAuth/SSO login buttons", () => {
  test.use({
    stubOptions: {
      enableLogin: true,
      user: {
        id: 1,
        username: "admin",
        email: "admin",
        roles: ["ROLE_ADMIN"],
      },
    },
    autoGoto: false,
  });

  test("renders Continue-with-X buttons when oauth2 providers configured", async ({
    page,
  }) => {
    // Override the bootstrap config-app-config mock with provider data
    await page.route("**/api/v1/config/app-config", (route) =>
      route.fulfill({
        json: {
          enableLogin: true,
          languages: ["en-GB"],
          defaultLocale: "en-GB",
          oauth2: {
            enabled: true,
            providers: [
              { id: "keycloak", name: "Keycloak" },
              { id: "google", name: "Google" },
            ],
          },
          saml2: { enabled: true, provider: "Authentik" },
        },
      }),
    );

    // The proprietary login page reads ui-data/login for branding + provider list
    // The frontend expects `providerList` as a {path: displayName} map.
    await page.route("**/api/v1/proprietary/ui-data/login", (route) =>
      route.fulfill({
        json: {
          enableLogin: true,
          loginMethod: "all",
          providerList: {
            "/oauth2/authorization/keycloak": "Keycloak",
            "/oauth2/authorization/google": "Google",
            "/saml2/authenticate/stirling": "Authentik",
          },
          ssoAutoLogin: false,
          firstTimeSetup: false,
          showDefaultCredentials: false,
        },
      }),
    );

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // Email/password form is still there
    await expect(page.locator("#email")).toBeVisible({ timeout: 10_000 });

    // Provider buttons render — match flexibly because the exact
    // markup depends on the proprietary layer we're stubbing into.
    const oauthHints = page.locator(
      'a[href*="oauth2"], a[href*="saml"], button:has-text("Keycloak"), button:has-text("Google"), button:has-text("Authentik")',
    );
    await expect
      .poll(async () => oauthHints.count(), { timeout: 5_000 })
      .toBeGreaterThan(0);
  });
});
