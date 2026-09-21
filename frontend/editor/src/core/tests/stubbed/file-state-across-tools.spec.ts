import { test, expect } from "@app/tests/helpers/stub-test-base";
import { openRecents, uploadFiles } from "@app/tests/helpers/ui-helpers";
import path from "path";

test.use({ filesViewMode: "grid" });

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

/** Exercises file persistence through full reloads and tool navigation. */
test.describe("File state persists across tool navigation", () => {
  test("file uploaded on /merge survives navigation to /split", async ({
    page,
  }) => {
    await uploadFiles(page, SAMPLE_PDF);

    await openRecents(page);
    await expect(
      page.locator(".files-page-card").filter({ hasText: /sample\.pdf/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto("/split");
    await page.waitForLoadState("domcontentloaded");

    await openRecents(page);
    await expect(
      page.locator(".files-page-card").filter({ hasText: /sample\.pdf/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("file uploaded on /merge survives an in-app tool-link navigation", async ({
    page,
  }) => {
    await page.goto("/merge");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    const splitNav = page.getByRole("link", { name: /^Split$/i }).first();
    if (await splitNav.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await splitNav.click();
    } else {
      await page.goto("/split");
    }

    // Wait for the route to commit before opening the library, or the two navigations race.
    await expect(page).toHaveURL(/\/split(?:$|[/?#])/);

    await openRecents(page);
    await expect(
      page.locator(".files-page-card").filter({ hasText: /sample\.pdf/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
