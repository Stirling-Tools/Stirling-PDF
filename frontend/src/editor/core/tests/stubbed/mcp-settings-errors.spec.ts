import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";

test.use({
  autoGoto: false,
  seedJwt: true,
  stubOptions: {
    enableLogin: true,
    isAdmin: true,
    user: {
      id: 1,
      username: "admin",
      roles: ["ROLE_ADMIN"],
      role: "ROLE_ADMIN",
    },
  },
});

const AUTHORIZATION = "**/api/v1/mcp/oauth/authorizations/auth-123";
const CONSENT_DETAILS = {
  authorization_id: "auth-123",
  scope: "mcp.tools.read",
  client: {
    name: "ChatGPT",
    domain: "chatgpt.com",
    verified: true,
    redirectHost: "chatgpt.com",
  },
};

async function appConfig(page: Page, extra: Record<string, unknown>) {
  await page.route("**/api/v1/config/app-config", (route) =>
    route.fulfill({
      json: {
        enableLogin: true,
        isAdmin: true,
        enableAnalytics: false,
        languages: ["en-US"],
        defaultLocale: "en-US",
        ...extra,
      },
    }),
  );
}

async function expectNoRequestErrorToast(page: Page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page.locator(".toast-item")).toHaveCount(0);
}

async function openAdminMcp(page: Page, mode: string) {
  await page.route("**/api/v1/admin/settings/section/mcp", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        auth: { mode, resourceId: "https://pdf.example.com/mcp" },
      },
    }),
  );
  await page.goto("/settings/adminConnections");
  const card = page.locator("#adminMcp-panel");
  await expect(card.getByText("Enable MCP Server")).toBeVisible({
    timeout: 30_000,
  });
  return card;
}

test("a consent request that cannot load is explained once, inline", async ({
  page,
}) => {
  const loads: string[] = [];
  await page.route(AUTHORIZATION, (route) => {
    loads.push(route.request().method());
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.goto("/oauth/consent?authorization_id=auth-123");
  await expect(page.getByText(/invalid or has expired/)).toBeVisible({
    timeout: 30_000,
  });
  await expectNoRequestErrorToast(page);
  expect(loads).toEqual(["GET"]);
});

test("a refused consent decision is explained once, inline", async ({
  page,
}) => {
  await page.route(AUTHORIZATION, (route) =>
    route.fulfill({ json: CONSENT_DETAILS }),
  );
  await page.route(`${AUTHORIZATION}/consent`, (route) =>
    route.fulfill({ status: 400, json: { error: "invalid_request" } }),
  );
  await page.goto("/oauth/consent?authorization_id=auth-123");
  await page
    .getByRole("button", { name: "Allow access" })
    .click({ timeout: 30_000 });
  await expect(
    page.getByText(/Could not complete this authorization/),
  ).toBeVisible();
  await expectNoRequestErrorToast(page);
});

test("a refused authorization request shows the server's reason, inline", async ({
  page,
}) => {
  await page.route("**/api/v1/mcp/oauth/authorizations", (route) =>
    route.fulfill({
      status: 400,
      json: {
        error: "invalid_request",
        error_description: "redirect_uri is not registered",
      },
    }),
  );
  await page.goto(
    "/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fevil.example%2Fcb&response_type=code",
  );
  await expect(page.getByText("redirect_uri is not registered")).toBeVisible({
    timeout: 30_000,
  });
  await expectNoRequestErrorToast(page);
});

test("a connection test that cannot run is reported in the card only", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/settings/mcp/preflight", (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  const card = await openAdminMcp(page, "builtin");
  await card.getByRole("button", { name: "Test connection" }).click();
  await expect(card.getByText(/Could not run the test/)).toBeVisible();
  await expectNoRequestErrorToast(page);
});

test("API-key mode does not offer the URL as a ChatGPT or Claude connector", async ({
  page,
}) => {
  const card = await openAdminMcp(page, "apikey");
  await expect(card.getByText("MCP endpoint URL")).toBeVisible();
  await expect(
    card.getByText("Connector URL for ChatGPT and Claude"),
  ).toHaveCount(0);
});

test("a revoke that fails says so beside the app", async ({ page }) => {
  await appConfig(page, { mcpEnabled: true, mcpAuthMode: "builtin" });
  await page.route("**/api/v1/mcp/oauth/grants**", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, json: {} })
      : route.fulfill({
          json: [
            { id: 1, clientId: "c1", clientName: "ChatGPT", lastUsedAt: null },
          ],
        }),
  );
  await page.goto("/settings/mcp");
  await page.getByRole("button", { name: "Revoke" }).click({ timeout: 30_000 });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not revoke this app" }),
  ).toBeVisible();
  await expect(page.getByText("ChatGPT", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke" })).toBeEnabled();
});

test("the selected client tab fills with the primary token in dark mode", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await appConfig(page, { mcpEnabled: true, mcpAuthMode: "apikey" });
  await page.goto("/settings/mcp");
  const tab = page.getByRole("tab", { name: "Claude Desktop" });
  await expect(tab).toHaveAttribute("aria-selected", "true", {
    timeout: 30_000,
  });
  const colors = await tab.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--c-primary)";
    probe.style.color = "var(--c-text-on-primary)";
    el.appendChild(probe);
    const expected = getComputedStyle(probe);
    const actual = getComputedStyle(el);
    const result = {
      background: actual.backgroundColor,
      expectedBackground: expected.backgroundColor,
      color: actual.color,
      expectedColor: expected.color,
    };
    probe.remove();
    return result;
  });
  expect(colors.background).toBe(colors.expectedBackground);
  expect(colors.color).toBe(colors.expectedColor);
});

test("revoking an app asks first, and cancelling sends nothing", async ({
  page,
}) => {
  await appConfig(page, { mcpEnabled: true, mcpAuthMode: "builtin" });
  const deletes: string[] = [];
  await page.route("**/api/v1/mcp/oauth/grants**", (route) => {
    if (route.request().method() === "DELETE") {
      deletes.push(route.request().url());
      return route.fulfill({ json: { revoked: true } });
    }
    return route.fulfill({
      json: deletes.length
        ? []
        : [{ id: 1, clientId: "c1", clientName: "ChatGPT", lastUsedAt: null }],
    });
  });
  await page.goto("/settings/mcp");
  await page.getByRole("button", { name: "Revoke" }).click({ timeout: 30_000 });
  const dialog = page.getByRole("dialog").filter({ hasText: "ChatGPT" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(deletes).toEqual([]);

  await page.getByRole("button", { name: "Revoke" }).click();
  await dialog.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText(/No apps connected yet/)).toBeVisible();
  expect(deletes).toHaveLength(1);
});

test("connected apps that cannot load say so instead of looking empty", async ({
  page,
}) => {
  await appConfig(page, { mcpEnabled: true, mcpAuthMode: "builtin" });
  await page.route("**/api/v1/mcp/oauth/grants**", (route) =>
    route.fulfill({ status: 500, json: { error: "boom" } }),
  );
  await page.goto("/settings/mcp");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not load connected apps" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/No apps connected yet/)).toHaveCount(0);
  await expectNoRequestErrorToast(page);
});
