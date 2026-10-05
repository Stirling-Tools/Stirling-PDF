import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({
  autoGoto: false,
  stubOptions: { enableLogin: true },
  seedJwt: true,
});

test("cold load probes backend status exactly once", async ({ page }) => {
  const probes: string[] = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/api/v1/info/status") {
      probes.push(r.url());
    }
  });

  await page.goto("/editor", { waitUntil: "networkidle" });
  await page.locator(".workspace-frame").first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.waitForTimeout(2000);

  expect(probes).toHaveLength(1);
});
