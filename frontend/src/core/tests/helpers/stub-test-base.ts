import { test as base, expect } from "@playwright/test";
import {
  bypassOnboarding,
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
 * To seed a JWT so the user is treated as logged-in (required when
 * `enableLogin: true`, otherwise Landing redirects to /login):
 *   test.use({ stubOptions: { enableLogin: true }, seedJwt: true });
 *
 * To register a narrower stub for a tool endpoint, just call `page.route(...)`
 * after the fixture runs — Playwright uses last-registered-wins.
 */
type StubFixtures = {
  stubOptions: MockAppApiOptions;
  autoGoto: false | string;
  seedJwt: boolean;
};

// Minimal JWT-shaped value — the proprietary auth client only checks for
// the token's *presence* in localStorage before treating the user as
// logged-in; the stubbed `/auth/me` route supplies the actual user.
const STUB_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdHViLXVzZXIifQ.signature";

export const test = base.extend<StubFixtures>({
  stubOptions: [{}, { option: true }],
  autoGoto: ["/", { option: true }],
  seedJwt: [false, { option: true }],

  page: async ({ page, stubOptions, autoGoto, seedJwt }, use) => {
    await seedCookieConsent(page);
    if (seedJwt) {
      // Logged-in users hit the orchestrator path that surfaces the
      // analytics opt-in / MFA prompts — use the stronger bypass-all flag
      // so those overlays don't block clicks.
      await bypassOnboarding(page);
      await page.addInitScript((token) => {
        localStorage.setItem("stirling_jwt", token);
      }, STUB_JWT);
    } else {
      await skipOnboarding(page);
    }
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
