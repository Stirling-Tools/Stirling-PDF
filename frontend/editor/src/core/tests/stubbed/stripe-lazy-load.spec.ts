import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * Verifies that the Stripe SDK (@stripe/stripe-js, @stripe/react-stripe-js,
 * and the js.stripe.com remote script) is NOT fetched on cold page loads —
 * only when the checkout modal actually mounts. The proprietary
 * CheckoutProvider and the SaaS Plan settings page gate the modal behind
 * React.lazy + a conditional render so the Stripe chunk lives in its own
 * async bundle.
 */

const STRIPE_URL_FRAGMENTS = [
  "js.stripe.com",
  "@stripe/stripe-js",
  // Vite's optimizeDeps id mangles slashes to underscores when serving
  // pre-bundled dependencies from node_modules/.vite/deps.
  "@stripe_stripe-js",
  "@stripe/react-stripe-js",
  "@stripe_react-stripe-js",
];

function isStripeRequest(url: string): boolean {
  return STRIPE_URL_FRAGMENTS.some((fragment) => url.includes(fragment));
}

test.describe("Stripe SDK lazy loading", () => {
  test("landing page does not fetch Stripe SDK on cold load", async ({
    page,
  }) => {
    const stripeRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (isStripeRequest(url)) {
        stripeRequests.push(url);
      }
    });

    // The stub fixture already navigated to "/" with waitUntil:
    // domcontentloaded. Wait for the app to actually settle so any lurking
    // module-eval-time loadStripe() call would have already kicked off.
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {
        // Posthog / iconify keep some connections warm — fall back to a
        // brief settle window if networkidle never resolves.
      });
    await page.waitForTimeout(2_000);

    expect(
      stripeRequests,
      `Expected no Stripe-related network activity on landing, but observed:\n${stripeRequests.join("\n")}`,
    ).toEqual([]);
  });

  test("settings modal does not fetch Stripe SDK", async ({ page }) => {
    const stripeRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (isStripeRequest(url)) {
        stripeRequests.push(url);
      }
    });

    // Opening Settings is the closest a default proprietary user gets to
    // checkout without actually clicking Upgrade. Even rendering the
    // settings drawer must NOT pull Stripe into the entry path — only the
    // upgrade modal itself, which sits one click further in.
    const settingsButton = page
      .getByRole("button", { name: /settings/i })
      .first();
    if (await settingsButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await settingsButton.click();
      await page.waitForTimeout(1_500);
    }

    expect(
      stripeRequests,
      `Expected no Stripe-related network activity after opening settings, but observed:\n${stripeRequests.join("\n")}`,
    ).toEqual([]);
  });
});
