import { test, expect } from './helpers/test-base';
import { loginAndSetup } from './helpers/login';

test.describe('27. Browser Back/Forward Navigation', () => {
  test.describe('27.1 History Navigation Between Tools', () => {
    test('should navigate correctly using browser history', async ({ page }) => {
      await loginAndSetup(page);

      // Step 1: Click on "Merge" tool to navigate to /merge
      await page.locator('a[href="/merge"]').first().click();
      await expect(page).toHaveURL(/\/merge/);

      // Step 2: Click on the "All Tools" breadcrumb to go back to /
      await page.locator('a[href="/"]').first().click();
      await expect(page).toHaveURL('/');

      // Step 3: Click on "Split" tool to navigate to /split
      await page.locator('a[href="/split"]').first().click();
      await expect(page).toHaveURL(/\/split/);

      // Step 4-5: Press the browser back button, verify navigation returns to /
      await page.goBack();
      await expect(page).toHaveURL('/');

      // Step 6-7: Press the browser back button again, verify navigation returns to /merge
      await page.goBack();
      await expect(page).toHaveURL(/\/merge/);

      // Step 8-9: Press the browser forward button, verify navigation goes to /
      await page.goForward();
      await expect(page).toHaveURL('/');
    });
  });
});
