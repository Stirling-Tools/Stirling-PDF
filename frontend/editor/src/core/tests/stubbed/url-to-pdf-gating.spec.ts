import { test, expect } from "@app/tests/helpers/stub-test-base";

const listEntry = (page: import("@playwright/test").Page) =>
  page.locator('[data-tour="tool-button-urlToPdf"]').first();

test.describe("URL to PDF tracks the url-to-pdf endpoint flag", () => {
  test("endpoint enabled: offered in the tool list and the tool opens", async ({
    page,
  }) => {
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await expect(listEntry(page)).toBeVisible({ timeout: 15000 });
    await expect(listEntry(page)).not.toHaveAttribute("aria-disabled", "true");

    await page.goto("/url-to-pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("url-to-pdf-input")).toBeVisible({
      timeout: 15000,
    });
  });

  test.describe("endpoint disabled", () => {
    test.use({
      stubOptions: {
        endpointsAvailability: { "url-to-pdf": { enabled: false } },
      },
    });

    test("still listed, but marked unavailable and will not open", async ({
      page,
    }) => {
      await page.goto("/editor", { waitUntil: "domcontentloaded" });
      await expect(listEntry(page)).toBeVisible({ timeout: 15000 });
      await expect(listEntry(page)).toHaveAttribute("aria-disabled", "true");

      await page.goto("/url-to-pdf", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      await expect(page.getByTestId("url-to-pdf-input")).toHaveCount(0);
    });
  });
});
