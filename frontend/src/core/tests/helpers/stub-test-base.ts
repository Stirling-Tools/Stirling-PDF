import { test as base, expect } from "@playwright/test";
import {
  mockAppApis,
  seedCookieConsent,
  skipOnboarding,
  type MockAppApiOptions,
} from "@app/tests/helpers/api-stubs";

/**
 * Custom Playwright fixture for backend-free specs.
 *
 * Every test gets a `page` that:
 *   1. Has the cookie-consent cookie seeded (banner never renders)
 *   2. Has onboarding flags set in localStorage (modal never renders)
 *   3. Has all bootstrap API endpoints stubbed via `mockAppApis()`
 *   4. Has already navigated to `/` by default (set `autoGoto: false` to skip)
 *
 * Usage:
 *   import { test, expect } from "@app/tests/helpers/stub-test-base";
 *
 *   test("something", async ({ page }) => {
 *     // page is already at `/` with stubs installed
 *     await page.getByRole("button", { name: "Merge" }).click();
 *   });
 *
 * To start somewhere other than `/`, navigate inside the test — Playwright
 * replaces the prior navigation, so the auto-goto is effectively free.
 *
 * To skip the auto-goto entirely (e.g. inspecting cold mount):
 *   test.use({ autoGoto: false });
 *
 * To override the stub options (enable login, change user, …):
 *   test.use({ stubOptions: { enableLogin: true } });
 *
 * To register a narrower stub for a tool endpoint, just call `page.route(...)`
 * after the fixture runs — Playwright uses last-registered-wins.
 */
type StubFixtures = {
  stubOptions: MockAppApiOptions;
  autoGoto: false | string;
};

export const test = base.extend<StubFixtures>({
  stubOptions: [{}, { option: true }],
  autoGoto: ["/", { option: true }],

  page: async ({ page, stubOptions, autoGoto }, use) => {
    await seedCookieConsent(page);
    await skipOnboarding(page);
    await mockAppApis(page, stubOptions);
    if (autoGoto !== false) {
      // waitUntil: 'domcontentloaded' avoids hanging on third-party CDN
      // resources (iconify, posthog, stripe) the stub doesn't mock — the
      // default 'load' event waits for ALL subresources, which can time out
      // on slow runners and is rarely what tests actually need.
      await page.goto(autoGoto, { waitUntil: "domcontentloaded" });
    }
    await use(page);
  },
});

export { expect };
