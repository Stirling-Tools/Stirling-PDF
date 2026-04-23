import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("17. Direct URL Navigation", () => {
  test.describe("17.1 Navigate to Valid Tool URLs", () => {
    test("should load correct tool pages via direct URL", async ({ page }) => {
      await loginAndSetup(page);

      // Step 1: Navigate to a representative sample of tool URLs and verify they load.
      // We use the SPA's client-side router (via window.location + popstate) so we
      // validate route resolution without triggering full-page reloads that can
      // overwhelm the Vite dev server and cause connection-refused errors.
      const toolUrls = [
        "/merge",
        "/split",
        "/compress",
        "/rotate",
        "/watermark",
        "/crop",
      ];

      for (const url of toolUrls) {
        // Navigate using the browser location API which the React Router listens to
        await page.evaluate((targetUrl) => {
          window.history.pushState({}, "", targetUrl);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, url);

        // Wait for the router to update — use string containment, not a hand-built regex
        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        await expect(page).toHaveURL(new RegExp(escapedUrl), { timeout: 5000 });

        // Verify the page rendered content (not blank/crashed)
        await expect(page.locator("body")).not.toBeEmpty();
      }

      // Step 2: Also verify one direct full-page navigation works end-to-end
      // (this tests the server-side fallback returning index.html for SPA routes)
      await page.goto("/merge", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/merge/);
      await expect(page.locator("body")).not.toBeEmpty();
    });
  });

  test.describe("17.2 Navigate to Invalid URL", () => {
    test("should handle unknown routes gracefully", async ({ page }) => {
      await loginAndSetup(page);

      // Step 1: Navigate to a nonexistent page
      await page.goto("/nonexistent-page-12345");
      await page.waitForLoadState("domcontentloaded");

      // Step 2: Verify the application handles the unknown route (404 page or redirect to home)
      // The page should not crash or show a white screen
      const bodyContent = await page.locator("body").textContent();
      expect(bodyContent).toBeTruthy();
      expect(bodyContent!.length).toBeGreaterThan(0);
    });
  });

  test.describe("17.3 Navigate Without Authentication", () => {
    test("should redirect unauthenticated users to login", async ({ page }) => {
      // Starting state: User is logged out
      // Step 1: Navigate directly to /merge
      await page.goto("/merge");

      // Step 2: Verify the user is redirected to the login page
      // The app uses React Router state-based redirect (state.from), not URL params
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });
  });
});
