import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({
  autoGoto: false,
  seedJwt: true,
  stubOptions: {
    enableLogin: true,
    isAdmin: true,
    user: { id: 1, username: "owner", role: "ROLE_ADMIN", portalAccess: true },
  },
});

test.beforeEach(async ({ page, context }) => {
  await context.route("**/api/v1/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/v1/config/app-config", (route) =>
    route.fulfill({
      json: {
        enableLogin: true,
        isAdmin: true,
        enableAnalytics: false,
        languages: ["en-US"],
        defaultLocale: "en-US",
        accountLinkAvailable: true,
      },
    }),
  );
  await page.route("**/api/v1/account-link/status", (route) =>
    route.fulfill({ json: { linked: false, name: "Test server" } }),
  );
  await page.route("**/api/v1/account-link/free-tier", (route) =>
    route.fulfill({
      json: {
        grantUnits: 1000,
        usedUnits: 125,
        remainingUnits: 875,
        periodStart: "2026-09-01T00:00:00",
        periodEnd: "2026-10-01T00:00:00",
      },
    }),
  );
});

for (const [path, action] of [
  ["/settings/account-link", "Connect your Stirling account"],
  ["/settings/billing", "Connect a Stirling account"],
  ["/settings/billing", "Switch on the Processor"],
  ["/processor/pipelines", "Link Stirling account"],
]) {
  test(`dismissing ${action} on ${path} leaves one usable connection action`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await expect(
      dialog.getByRole("button", {
        name: "Connect Stirling account",
        exact: true,
      }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Not now", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: action, exact: true }),
    ).toBeVisible();
  });
}

for (const path of ["/settings/account-link", "/settings/billing"]) {
  test(`expired billing access on ${path} has one recovery action after dismissal`, async ({
    page,
  }) => {
    await page.route("**/api/v1/account-link/status", (route) =>
      route.fulfill({
        json: { linked: true, name: "Test server", deviceId: "test-device" },
      }),
    );
    await page.goto(path);
    const renew = page.getByRole("button", {
      name: "Sign in again",
      exact: true,
    });
    await expect(renew).toHaveCount(1);
    await renew.click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(renew).toHaveCount(1);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(renew).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("This server has no Stirling account"),
    ).toHaveCount(0);
  });
}

test("dismissing the trial connection prerequisite does not reopen it", async ({
  page,
}) => {
  await page.goto("/settings/billing?procurement=start");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Not now", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Connect a Stirling account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("late exhausted-credit responses do not reopen a dismissed dialog", async ({
  page,
}) => {
  await page.goto("/processor/pipelines");
  await expect(
    page.getByRole("button", { name: "Link Stirling account" }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("stirling:portal-free-tier-exhausted")),
  );
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Not now", exact: true })
    .click();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("stirling:portal-free-tier-exhausted")),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Link Stirling account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});
