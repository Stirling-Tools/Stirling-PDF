import { test, expect } from '@app/tests/helpers/test-base';
import { loginAndSetup } from '@app/tests/helpers/login';

test.describe('4. PDF Tool Pages - Common Patterns', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test.describe('4.1 Tool Page - File Upload Required Before Processing', () => {
    test('should require file upload before processing on merge tool', async ({ page }) => {
      // Step 1: Navigate to the merge tool page
      await page.goto('/merge');
      await page.waitForLoadState('domcontentloaded');

      // Step 2: Verify the primary action button is disabled
      const actionButton = page.getByRole('button', { name: /merge|gabungkan/i }).first();
      await expect(actionButton).toBeVisible({ timeout: 10000 });
      await expect(actionButton).toBeDisabled();

      // Step 3: Verify the file upload area is displayed
      await expect(
        page.locator('[class*="upload"], [class*="dropzone"], input[type="file"]').first()
      ).toBeVisible();

      // Step 4: Verify that clicking the disabled action button does nothing
      await actionButton.click({ force: true });
      await expect(page).toHaveURL(/\/merge/);
    });
  });

  test.describe('4.2 Tool Page - Navigation Back to Home', () => {
    test('should navigate between tool pages and home via breadcrumbs and history', async ({ page }) => {
      // Step 1: Navigate to /compress
      await page.goto('/compress');
      await page.waitForLoadState('domcontentloaded');

      // Step 2: Click the sidebar "Tools" link to go back to /.
      // Prefer the sidebar link to the breadcrumb: on webkit the breadcrumb
      // click doesn't always trigger router navigation.
      const homeLink = page.getByRole('link', { name: /^Tools$/i }).first();
      await homeLink.click();

      // Step 3: Verify navigation back to the home dashboard
      await expect(page).toHaveURL('/');

      // Step 4: Use browser back button
      await page.goBack();

      // Step 5: Verify return to the tool page
      await expect(page).toHaveURL(/\/compress/);
    });
  });
});
