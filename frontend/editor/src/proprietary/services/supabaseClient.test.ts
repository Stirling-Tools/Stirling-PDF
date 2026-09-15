import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowConsole } from "@app/tests/failOnConsole";

vi.mock("@app/services/apiClient", () => ({ default: {} }));
vi.mock("@app/utils/protocolDetection", () => ({
  getCheckoutMode: () => "hosted",
}));

const url = "https://licensing-session.supabase.co";
const publicKey = "public-test-key";
const storageKey = "sb-licensing-session-auth-token";
const user = {
  id: "untrusted-account",
  aud: "authenticated",
  email: "account@example.test",
};
const token = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(
    JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ),
  btoa("test-signature"),
]
  .map((part) => part.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"))
  .join(".");
const fragment =
  "#" +
  new URLSearchParams({
    access_token: token,
    refresh_token: "untrusted-refresh",
    expires_in: "3600",
    token_type: "bearer",
  });
const network = vi.fn<typeof fetch>();
let client: SupabaseClient | null;

beforeEach(() => {
  allowConsole.warn(
    /GoTrueClient@sb-licensing-session-auth-token:.*Multiple GoTrueClient instances detected/,
  );
  vi.resetModules();
  localStorage.clear();
  network.mockReset();
  network.mockImplementation(
    async (input) =>
      new Response(
        JSON.stringify(
          String(input).includes("/auth/v1/user") ? user : { received: true },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", network);
  vi.stubEnv("VITE_SUPABASE_URL", url);
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY", publicKey);
});

afterEach(async () => {
  await client?.auth.stopAutoRefresh();
  client = null;
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(["/", "/account-link/callback?state=untrusted"])(
  "does not capture or persist callback credentials when licensing boots at %s",
  async (path) => {
    window.history.replaceState({}, "", path + fragment);
    ({ supabase: client } = await import("@app/services/supabaseClient"));
    expect(client).not.toBeNull();
    expect((await client!.auth.getSession()).data.session).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(window.location.hash).toBe(fragment);
    expect(network).not.toHaveBeenCalled();
  },
);

it("keeps license function requests independent of stored billing credentials", async () => {
  const persisted = JSON.stringify({
    access_token: token,
    refresh_token: "stored-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  });
  localStorage.setItem(storageKey, persisted);
  ({ supabase: client } = await import("@app/services/supabaseClient"));
  expect((await client!.auth.getSession()).data.session).toBeNull();
  const { default: licenseService } =
    await import("@app/services/licenseService");
  await licenseService.createCheckoutSession({
    lookup_key: "selfhosted:server:monthly",
  });
  await licenseService.createBillingPortalSession(
    "https://server.example.test/settings/billing",
    "test-license-key",
  );
  await licenseService.checkLicenseKey("test-installation");
  expect(network).toHaveBeenCalledTimes(3);
  for (const endpoint of [
    "create-checkout",
    "manage-billing",
    "get-license-key",
  ]) {
    const request = network.mock.calls.find(([input]) =>
      String(input).endsWith("/functions/v1/" + endpoint),
    );
    expect(request).toBeDefined();
    expect(new Headers(request![1]?.headers).get("authorization")).toBe(
      "Bearer " + publicKey,
    );
  }
  expect(localStorage.getItem(storageKey)).toBe(persisted);
});
