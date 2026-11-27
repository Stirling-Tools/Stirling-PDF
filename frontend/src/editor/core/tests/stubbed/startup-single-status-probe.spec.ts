import { test, expect } from "@editor/tests/helpers/stub-test-base";

test.use({
  autoGoto: false,
  stubOptions: { enableLogin: true },
  seedJwt: true,
});

test("cold load probes backend status exactly once", async ({ page }) => {
  const probes: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/v1/info/status") {
      probes.push(r.url());
    }
  });

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.locator(".workspace-frame").first().waitFor({
    state: "visible",
    timeout: 15000,
  });

  // The editor only renders after the startup mounts have run, so a second
  // probe from a duplicate mount would already be in `probes`.
  expect(probes).toHaveLength(1);
});
