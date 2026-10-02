import { test, expect, type APIRequestContext } from "@playwright/test";
import { anonymousApi, allKeys } from "@app/tests/saas-live/saasLive";

/**
 * The pipeline store as an anonymous visitor sees it, against a real SaaS backend and database:
 * the catalogue is open, nothing in it names a person, and every write needs an account
 * (stories BR-01, ID-01, AC-01, AC-02).
 */

const PUBLIC = "/api/v1/store/public/pipelines";
const UNKNOWN_ID = "sp-00000000";
const AUTHOR_KEYS = [
  "author",
  "publishedBy",
  "publishedByUserId",
  "publisherTeamId",
  "email",
];

let api: APIRequestContext;

test.beforeAll(async () => {
  api = await anonymousApi();
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe("Pipeline store, anonymous", () => {
  test("the backend reports the store as available", async () => {
    const res = await api.get("/api/v1/config/app-config");
    expect(res.status()).toBe(200);
    expect((await res.json()).storeAvailable).toBe(true);
  });

  test("the catalogue answers without credentials and carries no author", async () => {
    const res = await api.get(`${PUBLIC}?limit=60`);
    expect(res.status()).toBe(200);
    const page = await res.json();
    expect(Array.isArray(page.items)).toBe(true);
    expect(typeof page.total).toBe("number");
    const keys = allKeys(page);
    for (const key of AUTHOR_KEYS) {
      expect(keys.has(key), `public list exposes "${key}"`).toBe(false);
    }
    for (const item of page.items) {
      expect(item.storeId).toMatch(/^sp-[0-9a-hjkmnp-tv-z]{8}$/);
      expect(item.starred).toBeNull();
    }
  });

  test("every listed detail and manifest is readable and author-free", async () => {
    const page = await (await api.get(`${PUBLIC}?limit=10`)).json();
    test.skip(page.items.length === 0, "the catalogue is empty");
    for (const item of page.items) {
      const detail = await api.get(`${PUBLIC}/${item.storeId}`);
      expect(detail.status()).toBe(200);
      const body = await detail.json();
      expect(body.viewer).toBeNull();
      const keys = allKeys(body);
      for (const key of AUTHOR_KEYS) {
        expect(keys.has(key), `detail ${item.storeId} exposes "${key}"`).toBe(
          false,
        );
      }
      const manifest = await api.get(`${PUBLIC}/${item.storeId}/manifest`);
      expect(manifest.status()).toBe(200);
      expect(Array.isArray((await manifest.json()).steps)).toBe(true);
    }
  });

  test("an unknown store id is a 404", async () => {
    expect((await api.get(`${PUBLIC}/${UNKNOWN_ID}`)).status()).toBe(404);
    expect((await api.get(`${PUBLIC}/${UNKNOWN_ID}/manifest`)).status()).toBe(
      404,
    );
  });

  test("a bad cursor is a 400, not a 500", async () => {
    expect((await api.get(`${PUBLIC}?cursor=not-a-number`)).status()).toBe(400);
  });

  test("any origin may read the catalogue, without credentials", async () => {
    const res = await api.get(PUBLIC, {
      headers: { Origin: "https://store-e2e.example" },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["access-control-allow-origin"]).toBe("*");
    expect(res.headers()["access-control-allow-credentials"]).toBeUndefined();
  });

  for (const [method, url] of [
    ["POST", "/api/v1/store/publish/preflight"],
    ["POST", "/api/v1/store/publish"],
    ["POST", `/api/v1/store/pipelines/${UNKNOWN_ID}/republish`],
    ["DELETE", `/api/v1/store/pipelines/${UNKNOWN_ID}`],
    ["PUT", `/api/v1/store/pipelines/${UNKNOWN_ID}/star`],
    ["DELETE", `/api/v1/store/pipelines/${UNKNOWN_ID}/star`],
    ["POST", `/api/v1/store/pipelines/${UNKNOWN_ID}/install`],
    ["GET", "/api/v1/store/team/pipelines"],
    ["GET", "/api/v1/store/starred"],
  ] as const) {
    test(`${method} ${url} needs an account`, async () => {
      const res = await api.fetch(url, { method, data: {} });
      expect(res.status()).toBe(401);
    });
  }
});

test.describe("Pipeline store page, anonymous", () => {
  // BR-01 and AC-04: the store's pages open with no account, offer a way in, and nothing else of
  // the portal comes with them.
  test("the store index opens without signing in", async ({ page }) => {
    await page.goto("processor/store", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Pipeline store" }),
    ).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).not.toMatch(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Starred" })).toHaveCount(0);
  });

  test("a shared link opens the listing, slug and all", async ({ page }) => {
    const first = (await (await api.get(`${PUBLIC}?limit=1`)).json()).items[0];
    test.skip(!first, "the catalogue is empty");
    await page.goto(`store/p/${first.storeId}-${first.slug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: first.name })).toBeVisible({
      timeout: 30_000,
    });
    expect(new URL(page.url()).pathname).toMatch(
      new RegExp(`/processor/store/${first.storeId}$`),
    );
    await expect(
      page.getByRole("button", { name: "Sign in to install" }),
    ).toBeVisible();
    await expect(page.locator(".portal-store-listing__share-url")).toHaveText(
      new RegExp(`/store/p/${first.storeId}$`),
    );
  });

  test("the rest of the portal still needs an account", async ({ page }) => {
    await page.goto("processor/pipelines", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });
});
