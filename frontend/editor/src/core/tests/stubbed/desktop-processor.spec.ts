import type { Page } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { installTauri } from "@app/tests/helpers/tauriDiskStub";

// The real desktop build, signed in to a self-hosted server the stubs stand in
// for. Desktop requests go through the native HTTP plugin, which the IPC stub
// hands to window.fetch, so the page.route stubs answer them at the server's
// own address.
const SERVER = "http://server.test";

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.sig`;
}

const TOKEN = jwt({ sub: "alice", exp: 4_102_444_800 });
const CLOUD_TOKEN = jwt({
  sub: "5f0c2a7e-0000-4000-8000-000000000001",
  email: "alice@example.com",
  role: "authenticated",
  exp: 4_102_444_800,
});

test.use({
  autoGoto: false,
  stubOptions: {
    enableLogin: true,
    isAdmin: true,
    user: {
      id: 1,
      username: "alice",
      email: "alice@example.com",
      role: "ROLE_ADMIN",
      roles: ["ROLE_ADMIN"],
      portalAccess: true,
      orgOwner: true,
    },
  },
});

async function signInToServer(page: Page) {
  await installTauri(page, {
    connection: {
      mode: "selfhosted",
      server_config: { url: SERVER },
      lock_connection_mode: false,
    },
    commands: {
      get_auth_token: TOKEN,
      get_refresh_token: null,
      get_user_info: { username: "alice", email: "alice@example.com" },
    },
  });
  await page.addInitScript((token) => {
    localStorage.setItem("stirling_jwt", token);
  }, TOKEN);
}

test("opens the Processor as a page of the desktop app", async ({ page }) => {
  await signInToServer(page);
  await page.goto("/processor", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".desktop-processor .portal-shell")).toBeVisible({
    timeout: 30_000,
  });
  // One search, in the title-bar strip, and it is the Processor's.
  await expect(page.locator("#portal-search-input")).toHaveCount(1);
  await expect(page.locator(".portal-searchbar")).toHaveCount(0);
  // The window's height below the strip, not the page's: the shell pins the web viewport.
  const sidebar = await page.locator(".portal-sidebar").boundingBox();
  expect(sidebar?.height).toBeGreaterThan(page.viewportSize()!.height - 60);
});

test("opens the Processor on Stirling Cloud", async ({ page }) => {
  // Context routes yield to the page stubs, so this only catches what they leave:
  // nothing reaches a real Stirling host.
  await page
    .context()
    .route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await installTauri(page, {
    connection: {
      mode: "saas",
      server_config: { url: "https://auth.stirling.com" },
      lock_connection_mode: false,
    },
    commands: {
      get_auth_token: CLOUD_TOKEN,
      get_refresh_token: "refresh",
      get_user_info: { username: "alice", email: "alice@example.com" },
    },
  });
  await page.goto("/processor", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".desktop-processor .portal-shell")).toBeVisible({
    timeout: 30_000,
  });
});

test("sends local mode back to the editor", async ({ page }) => {
  await installTauri(page);
  await page.goto("/processor", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(page.locator(".portal-shell")).toHaveCount(0);
});
