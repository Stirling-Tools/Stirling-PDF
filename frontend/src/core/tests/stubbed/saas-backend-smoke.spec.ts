/**
 * Live saas-backend smoke. Hits the actual Spring Boot saas backend at a
 * configured port and verifies the fixes landed in this branch. NOT in CI: it
 * needs a real backend running (see env override).
 *
 * Run locally:
 *   STIRLING_SAAS_URL=http://localhost:18083 \
 *     npx playwright test --project=stubbed saas-backend-smoke
 */
import { test, expect, request } from "@playwright/test";

const SAAS_URL = process.env.STIRLING_SAAS_URL ?? "http://localhost:18083";

test.describe("SaaS backend smoke", () => {
  test("health endpoint returns UP", async () => {
    const ctx = await request.newContext();
    const r = await ctx.get(`${SAAS_URL}/actuator/health`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe("UP");
  });

  test("public endpoints return 200 / protected return 401", async () => {
    const ctx = await request.newContext();
    expect((await ctx.get(`${SAAS_URL}/api/v1/info/status`)).status()).toBe(200);
    expect(
      (await ctx.get(`${SAAS_URL}/api/v1/config/app-config`)).status(),
    ).toBe(200);
    // Credits requires auth — without a JWT or API-key we expect 401.
    expect((await ctx.get(`${SAAS_URL}/api/v1/credits`)).status()).toBe(401);
  });

  test("user-role webhook endpoints reject unauthenticated (regression #3)", async () => {
    // Before the hasRole('ROLE_ADMIN') fix, an authenticated admin would
    // have hit an IAE inside Spring's authorization manager. Without
    // auth at all the route still returns 401 (auth filter blocks first)
    // — this guards against any 5xx regression on the four webhook paths.
    const ctx = await request.newContext();
    for (const path of [
      "/api/v1/user-role/upgrade?supabaseId=foo",
      "/api/v1/user-role/downgrade?supabaseId=foo",
      "/api/v1/user-role/enable-metered-billing?supabaseId=foo",
      "/api/v1/user-role/disable-metered-billing?supabaseId=foo",
    ]) {
      const r = await ctx.post(`${SAAS_URL}${path}`);
      expect(r.status(), `${path}: expected 401, got ${r.status()}`).toBe(401);
      expect(
        r.status(),
        `${path}: must not 500 — would indicate hasRole prefix bug returned`,
      ).not.toBe(500);
    }
  });

  test("CORS preflight rejects unknown origin (regression #11)", async () => {
    const ctx = await request.newContext();
    const r = await ctx.fetch(`${SAAS_URL}/api/v1/credits`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://attacker.example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(r.status()).toBe(403);
    expect(r.headers()["access-control-allow-origin"]).toBeUndefined();
  });

  test("CORS preflight rejects tenant wildcard origin (regression #11)", async () => {
    // Previously the default allowlist contained `https://*.ssl.stirlingpdf.cloud`
    // paired with allowCredentials=true. The wildcard was removed; any
    // subdomain on that pattern must now be denied like any other unknown
    // origin (until an operator explicitly opts in).
    const ctx = await request.newContext();
    const r = await ctx.fetch(`${SAAS_URL}/api/v1/credits`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://abandoned-tenant.ssl.stirlingpdf.cloud",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(r.status()).toBe(403);
    expect(r.headers()["access-control-allow-origin"]).toBeUndefined();
  });

  test("CORS preflight accepts allowed origin", async () => {
    const ctx = await request.newContext();
    const r = await ctx.fetch(`${SAAS_URL}/api/v1/credits`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.stirling.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(r.status()).toBe(200);
    expect(r.headers()["access-control-allow-origin"]).toBe(
      "https://app.stirling.com",
    );
    expect(r.headers()["access-control-allow-credentials"]).toBe("true");
  });

  test("backend HTML loads in a real browser (no boot-time console errors)", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
    });

    const resp = await page.goto(`${SAAS_URL}/`, { waitUntil: "load" });
    expect(resp?.status()).toBe(200);

    // Give any deferred boot scripts a moment to throw.
    await page.waitForTimeout(750);

    // Filter out the known-noisy 401s on /api/v1/credits — that's the right
    // behaviour for an unauthenticated page load and not a "regression".
    const real = errors.filter(
      (e) => !/Failed to load resource.*401|\/api\/v1\/credits/i.test(e),
    );
    expect(real, real.join("\n")).toEqual([]);
  });
});
