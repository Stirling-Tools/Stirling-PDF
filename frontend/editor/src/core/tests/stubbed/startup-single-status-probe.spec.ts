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

  // networkidle already waited for the startup requests to go quiet, so a probe
  // re-issued by a second mount would be recorded by now.
  expect(probes).toHaveLength(1);
});
