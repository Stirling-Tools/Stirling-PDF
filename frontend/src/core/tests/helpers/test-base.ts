import { test as base, expect } from "@playwright/test";

/**
 * Custom test fixture that auto-dismisses the cookie consent banner
 * before every test. The banner (#cc-main) overlays the page and
 * intercepts pointer events, causing click timeouts across all tests.
 *
 * Usage: import { test, expect } from '@app/tests/helpers/test-base';
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Set the cookie consent cookie before any navigation so the banner
    // never appears. The cookieconsent library (orestbida/cookieconsent)
    // reads this cookie on init and skips the banner if consent exists.
    await page.context().addCookies([
      {
        name: "cc_cookie",
        value: JSON.stringify({
          categories: ["necessary"],
          revision: 0,
          data: null,
          rfc_cookie: false,
          consentTimestamp: new Date().toISOString(),
          consentId: "playwright-test",
        }),
        domain: "localhost",
        path: "/",
      },
    ]);

    await use(page);
  },
});

export { expect };
