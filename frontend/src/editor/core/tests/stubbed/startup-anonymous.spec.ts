import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({
  autoGoto: false,
  stubOptions: { enableLogin: false, user: null },
});

test.describe("login-disabled startup", () => {
  for (const path of ["/editor", "/share"]) {
    for (const enableAnalytics of [false, true]) {
      test(`loads ${path} without repeated config requests (analytics=${enableAnalytics})`, async ({
        page,
        context,
      }) => {
        await context.clearCookies();
        let configRequests = 0;
        let accountRequests = 0;
        await page.route("**/api/v1/proprietary/ui-data/account", (route) => {
          accountRequests++;
          return route.fulfill({ json: {} });
        });
        await page.route("**/api/v1/config/app-config", async (route) => {
          configRequests++;
          // Keep the refresh in flight long enough for React to render its loading state.
          await new Promise((resolve) => setTimeout(resolve, 100));
          await route.fulfill({
            json: {
              enableLogin: false,
              isAdmin: false,
              enableAnalytics,
              enablePosthog: false,
              enableScarf: false,
              languages: ["en-US"],
              defaultLocale: "en-US",
            },
          });
        });

        await page.goto(path, { waitUntil: "domcontentloaded" });
        const editor = page.locator(".workspace-frame");
        await expect(editor).toBeVisible();
        const consent = page.locator("#cc-main .cm");
        if (enableAnalytics) {
          await expect(consent).toBeVisible();
          await consent
            .getByRole("button", { name: "No Thanks", exact: true })
            .click();
        }

        // A briefly visible editor can still be remounting in a refetch loop.
        await page.waitForTimeout(1000);
        await expect(editor).toBeVisible();
        await expect(consent).toBeHidden();
        expect(configRequests).toBeLessThanOrEqual(3);
        expect(accountRequests).toBe(0);
      });
    }
  }
});
