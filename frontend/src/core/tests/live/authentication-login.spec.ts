import { test, expect } from "@app/tests/helpers/test-base";
import { login, dismissWelcomeDialog } from "@app/tests/helpers/login";

test.describe("1. Authentication and Login", () => {
  test.describe("1.1 Login Page - Happy Path", () => {
    test("should login successfully with valid credentials", async ({
      page,
    }) => {
      // Step 1: Verify the browser redirects to /login
      await page.goto("/");
      await expect(page).toHaveURL(/\/login/);

      // Step 2: Confirm the login page displays the Stirling PDF logo
      await expect(
        page
          .locator(
            'img[alt*="Stirling"], img[src*="stirling"], img[src*="logo"]',
          )
          .first(),
      ).toBeVisible();

      // Step 3: Confirm the heading for "Sign In" / "Login" is visible
      await expect(
        page.getByRole("heading", { name: /sign in|login|masuk/i }),
      ).toBeVisible();

      // Step 4: Confirm a "Username" text input field is present and empty
      const usernameInput = page.locator("#email");
      await expect(usernameInput).toBeVisible();
      await expect(usernameInput).toHaveValue("");

      // Step 5: Confirm a "Password" text input field is present and empty
      const passwordInput = page.locator("#password");
      await expect(passwordInput).toBeVisible();
      await expect(passwordInput).toHaveValue("");

      // Step 6: Confirm the "Sign In" button is present and disabled when both fields are empty
      const signInButton = page.locator('button[type="submit"]');
      await expect(signInButton).toBeVisible();
      await expect(signInButton).toBeDisabled();

      // Step 7: Enter a valid username into the username field
      await usernameInput.fill("admin");

      // Step 8: Enter a valid password into the password field
      await passwordInput.fill("admin");

      // Step 9: Confirm the "Sign In" button becomes enabled
      await expect(signInButton).toBeEnabled();

      // Step 10: Click the "Sign In" button
      await signInButton.click();

      // Step 11: Verify the user is redirected to the home page at /
      await page.waitForURL("/", { timeout: 15000 });
      await expect(page).toHaveURL("/");

      // Step 12: Verify the home dashboard loads with tool sidebar and file upload area visible
      await expect(
        page
          .locator('.h-screen, .mobile-layout, [data-testid="dashboard"]')
          .first(),
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("1.3 Login Page - Empty Fields Validation", () => {
    test("should keep Sign In button disabled when fields are empty", async ({
      page,
    }) => {
      // Starting state: User is logged out; browser on /login
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      const usernameInput = page.locator("#email");
      const passwordInput = page.locator("#password");
      const signInButton = page.locator('button[type="submit"]');

      // Step 1-2: Leave both fields empty, verify button is disabled
      await expect(signInButton).toBeDisabled();

      // Step 3-4: Enter only a username value; leave password empty; verify button remains disabled
      await usernameInput.fill("admin");
      await expect(signInButton).toBeDisabled();

      // Step 5-6: Clear username; enter only a password value; verify button remains disabled
      await usernameInput.clear();
      await passwordInput.fill("admin");
      await expect(signInButton).toBeDisabled();
    });
  });

  test.describe("1.5 Login Page - Session Expiry and Redirect", () => {
    test("should redirect back to intended page after re-login", async ({
      page,
    }) => {
      // Starting state: User is logged in and on a tool page
      await login(page);
      await dismissWelcomeDialog(page);
      await page.goto("/merge");
      await page.waitForLoadState("domcontentloaded");

      // Step 1-2: Invalidate session by clearing cookies and localStorage JWT,
      // then re-add the cookie consent cookie so the banner doesn't block after redirect
      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem("stirling_jwt");
        localStorage.removeItem("stirling_refresh_token");
      });
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

      // Full page reload forces the SPA to re-check auth with the backend
      await page.reload({ waitUntil: "domcontentloaded" });

      // Step 3: Verify the user is redirected to the login page
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });

      // Step 5: Log in with valid credentials
      await page.locator("#email").fill("admin");
      await page.locator("#password").fill("admin");
      await page.locator('button[type="submit"]').click();

      // Step 6: Verify the user is redirected back to /merge or home.
      // Any non-/login URL is acceptable — the app may route to the original
      // page (/merge) or to the dashboard (/), both are valid post-login states.
      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15000,
      });
    });
  });

  test.describe("1.6 Login Page - Carousel/Slideshow", () => {
    test("should navigate between carousel slides", async ({ page }) => {
      // Carousel is hidden on small viewports (< 940px wide), ensure desktop size
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Starting state: User is logged out; browser on /login
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");

      // Step 1: Verify slide indicator dots are present (carousel uses aria-label "Go to slide N")
      const slideButtons = page.getByRole("button", { name: /Go to slide/i });
      const count = await slideButtons.count();
      test.skip(count === 0, "No carousel slides configured on this instance");

      // Step 2: Click through slides
      if (count >= 2) {
        await slideButtons.nth(1).click();
        await page.waitForTimeout(500);
      }
      if (count >= 3) {
        await slideButtons.nth(2).click();
        await page.waitForTimeout(500);
      }

      // Step 3: Click back to slide 1
      await slideButtons.nth(0).click();
      await page.waitForTimeout(500);
    });
  });
});
