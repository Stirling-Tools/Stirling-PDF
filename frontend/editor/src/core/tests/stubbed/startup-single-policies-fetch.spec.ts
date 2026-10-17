import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({ autoGoto: false });

test("cold load fetches the policy list exactly once", async ({ page }) => {
  const policyUrls: string[] = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/api/v1/policies") {
      policyUrls.push(r.url());
    }
  });

  await page.goto("/editor", { waitUntil: "networkidle" });
  await page.locator(".workspace-frame").first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.waitForTimeout(2000);

  expect(policyUrls).toHaveLength(1);
});
