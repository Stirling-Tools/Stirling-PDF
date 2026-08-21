import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type Route,
} from "@playwright/test";
import { seedCookieConsent } from "@app/tests/helpers/api-stubs";

/**
 * E2E coverage for the portal Infrastructure → API Keys tab (PR #6961:
 * multiple named personal API keys with per-key usage tracking). Drives the
 * list / create-and-reveal / revoke / empty / error flows through the real
 * portal shell.
 *
 * Auth is real (a genuine admin login against the backend) because the portal's
 * Spring AuthProvider doesn't settle under a fully-faked session; only the
 * `api-keys` CRUD responses are stubbed via `page.route`, so the assertions stay
 * deterministic and no real keys are created.
 *
 * Requirements to run for real: a backend on :8080 (reachable through the vite
 * proxy) AND a portal-enabled frontend (`import.meta.env.DEV`, or a build with
 * `VITE_INCLUDE_PORTAL=true`). The CI `vite preview` bundle ships with the
 * portal off, so each test skips cleanly there - the same defensive pattern as
 * audit-log-ui.spec.ts. Companion unit coverage that always runs in CI lives in
 * ApiKeysTab.test.tsx.
 */

const API_KEYS = "**/api/v1/proprietary/ui-data/infrastructure/api-keys";

type StubKey = {
  id: string;
  name: string;
  prefix: string;
  created: string;
  lastUsed: string;
  status: "active" | "revoked";
  usageToday: number;
  usageMonth: number;
  usageTotal: number;
};

function key(overrides: Partial<StubKey> = {}): StubKey {
  return {
    id: "1",
    name: "Production ingest",
    prefix: "sk_a1b2c3d4",
    created: "2026-07-10",
    lastUsed: "2026-07-15 09:30",
    status: "active",
    usageToday: 12,
    usageMonth: 340,
    usageTotal: 9001,
    ...overrides,
  };
}

/** Log in as the default admin; returns the JWT, or null when no backend answers. */
async function adminJwt(request: APIRequestContext): Promise<string | null> {
  for (const password of ["adminadmin", "stirling"]) {
    const res = await request
      .post("/api/v1/auth/login", { data: { username: "admin", password } })
      .catch(() => null);
    if (res?.ok()) {
      const body = await res.json().catch(() => null);
      const token = body?.session?.access_token;
      if (token) return token as string;
    }
  }
  return null;
}

/**
 * Real admin session + stubbed API-keys CRUD. `keys` seeds the list; create
 * prepends an active key and reveals a one-time secret; delete flips the target
 * to `revoked`; `loadStatus` forces the list GET to fail. Returns false (and the
 * caller skips) when there's no backend to authenticate against.
 */
async function setUpApiKeys(
  page: Page,
  request: APIRequestContext,
  opts: { keys?: StubKey[]; loadStatus?: number } = {},
): Promise<boolean> {
  const token = await adminJwt(request);
  if (!token) {
    test.skip(true, "No backend on :8080 to authenticate the portal");
    return false;
  }

  const list = [...(opts.keys ?? [])];

  await seedCookieConsent(page);
  await page.addInitScript((jwt) => {
    localStorage.setItem("stirling_jwt", jwt);
  }, token);

  // Revoke: flip the addressed key to revoked, 204 like the real endpoint.
  await page.route(`${API_KEYS}/*`, (route: Route) => {
    const id = route.request().url().split("/").pop() ?? "";
    const target = list.find((k) => k.id === id);
    if (target) target.status = "revoked";
    return route.fulfill({ status: 204, body: "" });
  });

  // List (GET) and create (POST).
  await page.route(API_KEYS, async (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { name: string };
      const created = key({
        id: String(list.length + 100),
        name: body.name,
        prefix: "sk_new00000",
        created: "2026-07-15",
        lastUsed: "Never",
        usageToday: 0,
        usageMonth: 0,
        usageTotal: 0,
      });
      list.unshift(created);
      return route.fulfill({
        json: {
          key: created,
          secret: "sk_test_demo_secret_shown_once",
        },
      });
    }
    if (opts.loadStatus && opts.loadStatus >= 400) {
      return route.fulfill({
        status: opts.loadStatus,
        json: { error: "boom" },
      });
    }
    return route.fulfill({ json: { keys: list } });
  });

  await page.goto("/processor/infrastructure");
  return true;
}

/**
 * Open the API Keys tab, or skip when the portal isn't in this build (the tab
 * never renders - e.g. the CI `vite preview` bundle). Returns false when skipped.
 */
async function openApiKeysTab(page: Page): Promise<boolean> {
  const tab = page.getByRole("button", { name: "API Keys" });
  if (!(await tab.isVisible({ timeout: 20_000 }).catch(() => false))) {
    test.skip(
      true,
      "Portal (/processor) not available/bootstrapped in this build",
    );
    return false;
  }
  await tab.click();
  return true;
}

test.describe("Portal API Keys tab", () => {
  test("shows the empty state when the caller has no keys", async ({
    page,
    request,
  }) => {
    if (!(await setUpApiKeys(page, request, { keys: [] }))) return;
    if (!(await openApiKeysTab(page))) return;

    await expect(page.getByText("No API keys yet")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("lists existing keys with prefix, status and usage", async ({
    page,
    request,
  }) => {
    if (
      !(await setUpApiKeys(page, request, {
        keys: [
          key({ id: "1", name: "Production ingest", prefix: "sk_a1b2c3d4" }),
          key({
            id: "2",
            name: "Old key",
            prefix: "sk_z9y8x7w6",
            status: "revoked",
          }),
        ],
      }))
    )
      return;
    if (!(await openApiKeysTab(page))) return;

    await expect(page.getByText("Production ingest")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("sk_a1b2c3d4")).toBeVisible();
    // The revoked key still lists, tagged as such.
    await expect(page.getByText("Old key")).toBeVisible();
  });

  test("creates a key and reveals the one-time secret once", async ({
    page,
    request,
  }) => {
    if (!(await setUpApiKeys(page, request, { keys: [] }))) return;
    if (!(await openApiKeysTab(page))) return;

    await page.getByRole("button", { name: "Create key" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox").fill("CI smoke key");
    await dialog.getByRole("button", { name: "Create key" }).click();

    // The plaintext secret is shown exactly once, with a store-it-now warning.
    await expect(
      dialog.getByText("sk_test_demo_secret_shown_once"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/won't be shown again/i)).toBeVisible();

    await dialog.getByRole("button", { name: "Done" }).click();
    // Back on the list, the new key is present.
    await expect(page.getByText("CI smoke key")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("revokes a key after confirmation", async ({ page, request }) => {
    if (
      !(await setUpApiKeys(page, request, {
        keys: [key({ id: "1", name: "Doomed key", status: "active" })],
      }))
    )
      return;
    if (!(await openApiKeysTab(page))) return;

    // Expand the card, then ask to revoke.
    await page.getByRole("button", { name: /Doomed key/ }).click();
    await page.getByRole("button", { name: "Revoke key" }).first().click();

    // Confirm in the dialog.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/can't be undone/i)).toBeVisible();
    await dialog.getByRole("button", { name: "Revoke key" }).click();

    // The dialog closes and the reloaded list shows the key as revoked.
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Revoked").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("surfaces a load error instead of a false empty state", async ({
    page,
    request,
  }) => {
    if (!(await setUpApiKeys(page, request, { keys: [], loadStatus: 500 })))
      return;
    if (!(await openApiKeysTab(page))) return;

    await expect(
      page.getByText("Couldn't load your API keys. Please try again."),
    ).toBeVisible({ timeout: 10_000 });
    // A failed load must not masquerade as "no keys yet".
    await expect(page.getByText("No API keys yet")).toHaveCount(0);
  });
});
