import { test, expect } from "@app/tests/helpers/stub-test-base";
import { mockAppApis, seedCookieConsent } from "@app/tests/helpers/api-stubs";

test.describe("2. Main Dashboard / Home Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test.describe("2.1 Dashboard Layout and Tool Categories", () => {
    test("should display all navigation elements and tool categories", async ({
      page,
    }) => {
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

      await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();

      await expect(
        page.getByRole("button", { name: /fullscreen|sidebar/i }).first(),
      ).toBeVisible();

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

      await page
        .getByText(/^Merge$/i)
        .first()
        .click();

      await expect(page).toHaveURL(/\/merge/, { timeout: 10000 });

      await page.goto("/");

      await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
    });
  });

  test.describe("2.3 Dashboard - File Upload Area", () => {
    test("should display file upload area with buttons", async ({ page }) => {
      const uploadButton = page
        .getByRole("button", { name: /upload|add files/i })
        .first();
      await expect(uploadButton).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("2.4 Dashboard - Footer Links", () => {
    test("should display footer links with correct URLs", async ({ page }) => {
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

      const githubLink = page
        .locator('a[href*="github.com/Stirling-Tools/Stirling-PDF"]')
        .first();
      await expect(githubLink).toBeVisible();

      const discordLink = page
        .locator('a[href*="discord.gg/Cn8pWhQRxZ"]')
        .first();
      await expect(discordLink).toBeVisible();
    });
  });

  test.describe("2.5 Dashboard - Welcome Dialog for fresh users", () => {
    test("should show welcome dialog when onboarding flags are unset", async ({
      browser,
    }) => {
      // Fresh context — no localStorage flags, so the onboarding modal should appear.
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      const page = await context.newPage();

      await seedCookieConsent(page);
      await mockAppApis(page);
      await page.goto("/");

      const welcomeDialog = page.getByText(/welcome/i).first();
      await expect(welcomeDialog).toBeVisible({ timeout: 10000 });

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

      await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({
        timeout: 10000,
      });

      await context.close();
    });
  });
});
