import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({
  autoGoto: false,
  seedJwt: true,
  stubOptions: {
    enableLogin: true,
    isAdmin: true,
    user: {
      id: 1,
      username: "owner",
      role: "ROLE_ADMIN",
      portalAccess: true,
      orgOwner: true,
    },
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
  await page.route("**/api/v1/account-link/free-tier", (route) =>
    route.fulfill({
      json: {
        grantUnits: 1000,
        usedUnits: 1000,
        remainingUnits: 0,
        periodStart: "2026-09-01T00:00:00",
        periodEnd: "2026-10-01T00:00:00",
      },
    }),
  );
  await page.route("**/api/v1/policies", (route) =>
    route.fulfill({
      status: 402,
      json: { error: "ACCOUNT_LINK_REQUIRED", reason: "FREE_TIER_EXHAUSTED" },
    }),
  );
  await page.goto("/processor/pipelines");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Not now", exact: true })
    .click();
  const repeatedFailure = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/policies") && response.status() === 402,
  );
  await page.reload();
  await repeatedFailure;
  await expect(
    page.getByRole("button", { name: "Link Stirling account" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Link Stirling account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

for (const role of ["ROLE_ADMIN", "ROLE_TEAM_LEAD", "ROLE_USER"]) {
  for (const path of [
    "/settings/account-link",
    "/settings/billing",
    "/processor/documents",
  ]) {
    test(`non-owner ${role} has no account or billing prompts on ${path}`, async ({
      page,
    }) => {
      await page.route("**/api/v1/auth/me", (route) =>
        route.fulfill({
          json: {
            user: {
              id: 2,
              username: "colleague",
              role,
              portalAccess: true,
              orgOwner: false,
            },
          },
        }),
      );
      let linkRequests = 0;
      await page.route("**/api/v1/account-link/**", (route) => {
        linkRequests++;
        return route.fulfill({ status: 403, json: {} });
      });
      await page.goto(path);
      await expect(
        page.getByRole("button", { name: "colleague — Account", exact: true }),
      ).toBeVisible();
      await page.evaluate(() =>
        window.dispatchEvent(new Event("stirling:portal-free-tier-exhausted")),
      );
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: /^(Connect your Stirling account|Connect a Stirling account|Link Stirling account|Sign in again)$/,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Renew billing access", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Usage & Billing", exact: true }),
      ).toHaveCount(0);
      expect(linkRequests).toBe(0);
    });
  }
}

for (const linked of [false, true]) {
  test(`Documents loads local records when the server is ${linked ? "linked without billing access" : "unlinked"}`, async ({
    page,
  }) => {
    await page.route("**/api/v1/account-link/status", (route) =>
      route.fulfill({
        json: {
          linked,
          name: "Test server",
        },
      }),
    );
    const localDocuments = page.waitForRequest(
      "**/api/v1/proprietary/ui-data/documents?*",
    );
    await page.route("**/api/v1/proprietary/ui-data/documents?*", (route) =>
      route.fulfill({
        json: {
          summary: {
            totalInQueue: 0,
            processed: 1,
            errors: 0,
            processedToday: 1,
          },
          documents: [
            {
              id: "local-document",
              name: "Local invoice.pdf",
              type: "PDF",
              classification: null,
              auto: false,
              note: "Compressed locally",
              product: "Editor",
              action: null,
              user: "owner",
              status: "processed",
              reviewer: null,
              source: "Upload",
              confidence: null,
              fieldsExtracted: 0,
              time: "just now",
              sensitive: false,
              extractions: [],
              audit: [],
            },
          ],
        },
      }),
    );
    await page.goto("/processor/documents");
    const request = await localDocuments;
    expect(new URL(request.url()).origin).toBe(new URL(page.url()).origin);
    await expect(page.getByText("Local invoice.pdf")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("Renew billing access", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Sign in again", exact: true }),
    ).toHaveCount(0);
  });
}

for (const connectionState of [
  "unlinked",
  "connected",
  "offline",
  "expired",
  "revoked",
]) {
  const linked = connectionState !== "unlinked";
  test(`local navigation has no connection banner with a ${connectionState} server`, async ({
    page,
  }) => {
    await page.route("**/api/v1/account-link/status", (route) =>
      route.fulfill({
        json: {
          linked,
          name: "Test server",
          connection: { state: connectionState },
        },
      }),
    );
    await page.route("**/v1/editor/deployment*", (route) =>
      route.fulfill({
        json: { instances: [], summary: { workspaceUrl: null } },
      }),
    );
    for (const path of ["policies", "policies/runs", "integrations"]) {
      await page.route(`**/api/v1/${path}`, (route) =>
        route.fulfill({ json: [] }),
      );
    }
    await page.route("**/api/v1/sources*", (route) =>
      route.fulfill({ json: { sources: [], kpis: [] } }),
    );
    if (linked) {
      await page.goto("/settings/billing");
      await expect(
        page.getByRole("button", { name: "Sign in again", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Processor", exact: true })
        .click();
    } else {
      await page.goto("/processor");
    }
    await expect(
      page.getByRole("button", { name: "Documents", exact: true }),
    ).toBeVisible();
    for (const section of ["Home", "Documents", "Pipelines"]) {
      await page.getByRole("button", { name: section, exact: true }).click();
      await expect(
        page.locator(`.portal-${section.toLowerCase()}`),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByText("Connect your Stirling account", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Renew billing access", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Sign in again", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Check connection", exact: true }),
      ).toHaveCount(0);
    }
    if (linked) {
      await page
        .getByRole("button", { name: "owner — Account", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Usage & Billing", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Sign in again", exact: true }),
      ).toHaveCount(1);
    }
  });
}
