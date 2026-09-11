import { afterEach, expect, it, vi } from "vitest";
import {
  configureSupabase,
  clearSupabaseSession,
} from "@app/auth/supabase/supabaseClient";
import { getPortalSaasToken } from "@portal/auth/portalSaasSession";
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));

const key = "sb-renewal-review-auth-token";
const jwt = (exp: number) =>
  [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ exp, sub: "00000000-0000-0000-0000-000000000001" })),
    btoa("test-signature"),
  ]
    .map((part) =>
      part.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
    )
    .join(".");

afterEach(() => {
  clearSupabaseSession();
  localStorage.removeItem(key);
  vi.unstubAllGlobals();
});

it("[US02] renews an expired persisted session through the real Supabase SDK", async () => {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.test",
  };
  const renewed = jwt(now + 3600);
  localStorage.setItem(
    key,
    JSON.stringify({
      access_token: jwt(now - 60),
      refresh_token: "old-refresh",
      expires_at: now - 60,
      token_type: "bearer",
      user,
    }),
  );
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: renewed,
        refresh_token: "rotated-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  configureSupabase({
    url: "https://renewal-review.supabase.co",
    key: "public-key",
    authOptions: { autoRefreshToken: false, detectSessionInUrl: false },
  });
  await expect(getPortalSaasToken()).resolves.toBe(renewed);
  expect(fetch).toHaveBeenCalledOnce();
  expect(String(fetch.mock.calls[0][0])).toContain(
    "/auth/v1/token?grant_type=refresh_token",
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body).refresh_token).toBe(
    "old-refresh",
  );
  const persisted = JSON.parse(localStorage.getItem(key)!);
  expect(JSON.parse(persisted.value).refresh_token).toBe("rotated-refresh");
});
