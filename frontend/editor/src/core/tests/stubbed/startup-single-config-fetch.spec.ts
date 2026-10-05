import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({ autoGoto: false });

test("cold load fetches app-config exactly once", async ({ page }) => {
  const configUrls: string[] = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/api/v1/config/app-config") {
      configUrls.push(r.url());
    }
  });

  await page.goto("/editor", { waitUntil: "networkidle" });
  await page.locator(".workspace-frame").first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.waitForTimeout(2000);

  expect(configUrls).toHaveLength(1);
});
