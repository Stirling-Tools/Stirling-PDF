import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({
  autoGoto: false,
  seedJwt: true,
  stubOptions: {
    enableLogin: true,
    isAdmin: true,
    user: {
      id: 1,
      username: "admin",
      role: "ROLE_ADMIN",
      processorAccess: true,
    },
  },
});

test.beforeEach(async ({ context }) => {
  // Page stubs take precedence; unrelated Processor queries must not reach a
  // live backend and turn a missing fixture into an expired-session redirect.
  await context.route("**/api/v1/**", (route) => route.fulfill({ json: {} }));
});

for (const path of [
  "/editor",
  "/settings/account",
  "/processor/policies",
  "/share",
  "/share/",
  "/share/token/extra",
  "/login/extra",
  "/signup/extra",
  "/auth",
  "/auth/unknown",
  "/invite",
  "/forgot-password",
  "/reset-password",
  "/oauth/consent",
  "/workflow/sign",
  "/workflow/sign/token/extra",
  "/mobile-scanner/extra",
  "/mobile-sign/extra",
  "/account-link/callback/extra",
  "/link",
]) {
  test(`requires a password change when opening ${path} first`, async ({
    page,
  }) => {
    await page.route("**/api/v1/proprietary/ui-data/account", (route) =>
      route.fulfill({
        json: {
          username: "admin",
          role: "ROLE_ADMIN",
          settings: "{}",
          changeCredsFlag: true,
        },
      }),
    );
    await page.route("**/api/v1/proprietary/ui-data/login", (route) =>
      route.fulfill({
        json: { showDefaultCredentials: true, enableLogin: true },
      }),
    );
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const dialog = page.getByRole("dialog", {
      name: "Onboarding",
      exact: true,
    });
    await expect(
      dialog.getByRole("textbox", { name: "New Password", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  });
}

test("keeps a genuine share page free of startup prompts, then requires setup on entering Editor", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  const accountRequests: string[] = [];
  await page.route("**/api/v1/proprietary/ui-data/account", (route) => {
    accountRequests.push(route.request().url());
    return route.fulfill({
      json: {
        username: "admin",
        role: "ROLE_ADMIN",
        settings: "{}",
        changeCredsFlag: true,
      },
    });
  });
  await page.route("**/api/v1/storage/share-links/token/metadata", (route) =>
    route.fulfill({
      json: { fileName: "Shared report.pdf", accessRole: "viewer" },
    }),
  );
  await page.goto("/share/token", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("Shared report.pdf", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Onboarding", exact: true }),
  ).toBeHidden();
  await expect(page.locator("#cc-main .cm")).toBeHidden();
  expect(accountRequests).toEqual([]);

  await page.goto("/share", { waitUntil: "domcontentloaded" });
  await expect(
    page
      .getByRole("dialog", { name: "Onboarding", exact: true })
      .getByRole("textbox", { name: "New Password", exact: true }),
  ).toBeVisible();
});

for (const path of ["/processor/policies", "/share", "/auth"]) {
  test(`shows cookie consent on a cold ${path} entry and remembers the choice in Editor`, async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.route("**/api/v1/config/app-config", (route) =>
      route.fulfill({
        json: {
          enableLogin: true,
          isAdmin: true,
          enableAnalytics: true,
          enablePosthog: false,
          enableScarf: false,
          languages: ["en-US"],
          defaultLocale: "en-US",
        },
      }),
    );
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const banner = page.locator("#cc-main .cm");
    await expect(banner).toBeVisible();
    await banner
      .getByRole("button", { name: "No Thanks", exact: true })
      .click();
    await expect(banner).toBeHidden();
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.CookieConsent));
    await expect(banner).toBeHidden();
    expect(
      (await context.cookies()).some((cookie) => cookie.name === "cc_cookie"),
    ).toBe(true);
  });
}
