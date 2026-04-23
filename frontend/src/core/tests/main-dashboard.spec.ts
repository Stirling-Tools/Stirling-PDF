import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";

test.describe("2. Main Dashboard / Home Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test.describe("2.1 Dashboard Layout and Tool Categories", () => {
    test("should display all navigation elements and tool categories", async ({
      page,
    }) => {
      // Step 1: Verify the QuickAccessBar navigation buttons are visible.
      // The sidebar renders QuickAccessButton components. "Tools" is an <a> with aria-label "Tools".
      // "Reader" and "Automate" are <a> tags with data-testid attributes.
      // "Files" is a button. "Tours" is inside data-tour="help-button". "Settings" has data-testid="config-button".
      await expect(
        page.getByRole("link", { name: /^Tools$/i }).first(),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.locator('[data-testid="read-button"]').first(),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="automate-button"]').first(),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="files-button"]').first(),
      ).toBeVisible();
      await expect(
        page.locator('[data-tour="help-button"]').first(),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="config-button"]').first(),
      ).toBeVisible();

      // Step 2: Verify a search box is present (placeholder: "Search tools...")
      await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();

      // Step 3: Verify a fullscreen toggle button is present (aria-label contains "fullscreen" or "sidebar")
      await expect(
        page.getByRole("button", { name: /fullscreen|sidebar/i }).first(),
      ).toBeVisible();

      // Step 4: Verify tool subcategory section headers are visible in the tool picker.
      // The ToolPicker renders "Recommended" header and then subcategory labels from translations.
      const categories = [
        /Recommended/,
        /Signing/,
        /Document Security/,
        /Verification/,
        /Document Review/,
        /Page Formatting/,
        /Extraction/,
        /Removal/,
        /Automation/,
        /General/,
        /Advanced Formatting/,
        /Developer Tools/,
      ];

      for (const category of categories) {
        await expect(page.getByText(category).first()).toBeVisible({
          timeout: 10000,
        });
      }
    });
  });

  test.describe("2.2 Dashboard - Recommended Tools", () => {
    test("should display recommended tools and navigate to merge", async ({
      page,
    }) => {
      // Step 1: Verify the "Recommended" section shows expected tools.
      // Tool names come from translations: "PDF Text Editor", "Merge", "Compare",
      // "Compress", "Convert", "Redact", "Multi-Tool", "OCR".
      const recommendedTools = [
        /PDF Text Editor/i,
        /Merge/i,
        /Compare/i,
        /Compress/i,
        /Convert/i,
        /Redact/i,
      ];

      for (const tool of recommendedTools) {
        await expect(page.getByText(tool).first()).toBeVisible({
          timeout: 10000,
        });
      }

      // Step 2: Click on Merge tool button in the tool picker
      await page
        .getByText(/^Merge$/i)
        .first()
        .click();

      // Step 3: Verify navigation to /merge
      await expect(page).toHaveURL(/\/merge/, { timeout: 10000 });

      // Step 4: Navigate back to /
      await page.goto("/");

      // Step 5: Verify the dashboard loads correctly again
      await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
    });
  });

  test.describe("2.3 Dashboard - File Upload Area", () => {
    test("should display file upload area with buttons", async ({ page }) => {
      // The Workbench renders a LandingPage with a Mantine Dropzone when no files are loaded.
      // It contains "Upload from computer" button or "Add Files" button.
      const uploadButton = page
        .getByRole("button", { name: /upload|add files/i })
        .first();
      await expect(uploadButton).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("2.4 Dashboard - Footer Links", () => {
    test("should display footer links with correct URLs", async ({ page }) => {
      // The Footer component renders links: Survey, Privacy Policy, Terms and Conditions,
      // Discord, GitHub, Accessibility.

      // Step 1: Verify footer links are present
      await expect(page.getByText("Survey").first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText("Privacy Policy").first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText(/Terms/i).first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText("Discord").first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText("GitHub").first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText("Accessibility").first()).toBeVisible({
        timeout: 10000,
      });

      // Step 2: Verify the GitHub link points to correct URL
      const githubLink = page
        .locator('a[href*="github.com/Stirling-Tools/Stirling-PDF"]')
        .first();
      await expect(githubLink).toBeVisible();

      // Step 3: Verify the Discord link points to correct URL
      const discordLink = page
        .locator('a[href*="discord.gg/Cn8pWhQRxZ"]')
        .first();
      await expect(discordLink).toBeVisible();
    });
  });

  test.describe("2.5 Dashboard - Welcome Dialog on First Login", () => {
    test("should show and dismiss welcome dialog", async ({ browser }) => {
      // Use a fresh browser context so there is no lingering session or onboarding state.
      // This simulates a brand-new user visiting for the first time.
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      const page = await context.newPage();

      // Set cookie consent to prevent the cookie banner from blocking interaction
      await context.addCookies([
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

      // Navigate to login and authenticate
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");
      await page
        .locator("#email")
        .waitFor({ state: "visible", timeout: 30000 });
      await page.locator("#email").fill("admin");
      await page.locator("#password").fill("admin");
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("/", { timeout: 15000 });

      // Step 1: Verify a welcome/onboarding dialog appears.
      // The onboarding system shows "Welcome to Stirling" text.
      const welcomeDialog = page.getByText(/welcome/i).first();
      await expect(welcomeDialog).toBeVisible({ timeout: 10000 });

      // Step 2: Dismiss the dialog by pressing Escape
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

      // Step 3: Verify the dialog closes and the dashboard is accessible
      await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({
        timeout: 10000,
      });

      await context.close();
    });
  });
});
