import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({ stubOptions: { enableLogin: true, isAdmin: true }, seedJwt: true });

/**
 * Every in-app link into settings addresses a control by its `#slug` - the
 * super search, and the buttons inside banners and cards. The link must land on
 * the control and unfold whatever card it sits in.
 */
async function openSettings(
  page: import("@playwright/test").Page,
  url: string,
) {
  await page.goto(url);
  await expect(page.locator(".settings-page")).toBeVisible({ timeout: 30_000 });
  await page.locator(".settings-card").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1600);
}

const TARGETS = [
  // The two links the audit and usage pages point at.
  ["/settings/adminSecurity#auditLogging", "auditLogging"],
  // The link the mail card and the mobile-upload card point at.
  ["/settings/adminGeneral#frontendUrl", "frontendUrl"],
  ["/settings/adminConnections#adminMcp", "adminMcp"],
] as const;

for (const [url, anchor] of TARGETS) {
  test(`deep link ${url} scrolls to its control`, async ({ page }) => {
    await openSettings(page, url);
    const state = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return "MISSING";
      const r = el.getBoundingClientRect();
      const onScreen = r.top > -50 && r.top < window.innerHeight;
      return r.height > 0 && onScreen ? "reached" : "not-reached";
    }, anchor);
    expect(state).toBe("reached");
  });
}

test("a deep link into a collapsed card opens it", async ({ page }) => {
  // Keyboard Shortcuts ships collapsed - it renders a row per registered tool.
  await openSettings(page, "/settings/general#hotkeys");
  await expect(page.locator("#hotkeys")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});
