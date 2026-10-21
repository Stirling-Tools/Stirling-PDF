import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({ stubOptions: { enableLogin: true, isAdmin: true }, seedJwt: true });

/**
 * Warnings that describe a consequence must wait for the cause. Standing ones
 * warn about something the reader has not done, and stop being read.
 */
test("the audit cost warning waits until the option is on", async ({
  page,
}) => {
  await page.goto("/settings/adminSecurity");
  await expect(page.locator(".settings-page")).toBeVisible({ timeout: 30_000 });
  await page.locator(".settings-card").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);

  await expect(page.locator(".settings-toggle__warning")).toHaveCount(0);

  // Mantine hides the real checkbox; the track is what a user clicks.
  await page
    .locator(".settings-toggle", { hasText: "Capture File Hash" })
    .locator(".mantine-Switch-track")
    .first()
    .click();

  await expect(page.locator(".settings-toggle__warning")).toHaveCount(1);
});

test("the re-index warning waits until the embedding model moves", async ({
  page,
}) => {
  await page.goto("/settings/adminAi");
  await expect(page.locator(".settings-page")).toBeVisible({ timeout: 30_000 });
  await page.locator(".settings-card").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);

  const reindex = page.getByText("Re-index required");
  await expect(reindex).toHaveCount(0);

  await page
    .getByRole("textbox", { name: /embedding model/i })
    .first()
    .fill("nomic-embed-text");

  await expect(reindex).toHaveCount(1);
});
