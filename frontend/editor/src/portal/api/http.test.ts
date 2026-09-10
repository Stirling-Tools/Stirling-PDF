import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * api/http apiClient routing + error branches — the module exists specifically
 * to make portal→backend routing explicit after /v1/billing/wallet once fell
 * through to the local backend. The happy-path routing (saas hits the absolute
 * base with the Supabase bearer) is covered in api/link.test.ts; here we pin the
 * error/edge branches that gate the billing UI's error surface.
 */
const { getSession, refreshSession, getStoredTokenMock } = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  getStoredTokenMock: vi.fn(),
}));

vi.mock("@app/auth", () => ({ getStoredToken: getStoredTokenMock }));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => ({ auth: { getSession, refreshSession } }),
  configureSupabase: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));

import {
  apiClient,
  HttpError,
  SaasNotLinkedError,
  SaasUnconfiguredError,
} from "@portal/api/http";
import { resetPortalSaasSessionState } from "@portal/auth/portalSaasSession";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  getSession.mockReset();
  refreshSession.mockReset();
  resetPortalSaasSessionState();
  getStoredTokenMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiClient.saas", () => {
  it.each(["json", "text", "blob"] as const)(
    "renews and retries a %s read once after 401",
    async (format) => {
      vi.stubEnv("VITE_SAAS_API_URL", "https://saas.test.local");
      getSession.mockResolvedValue({
        data: { session: { access_token: "expired" } },
      });
      refreshSession.mockResolvedValue({
        data: { session: { access_token: "renewed" } },
      });
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(ok({ valid: true }));
      await apiClient.saas[format]("/read", {
        headers: { Authorization: "stale-override" },
      });
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
        "Bearer renewed",
      );
    },
  );

  it("does not repeat a purchase after a 401", async () => {
    vi.stubEnv("VITE_SAAS_API_URL", "https://saas.test.local");
    getSession.mockResolvedValue({
      data: { session: { access_token: "expired" } },
    });
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      apiClient.saas.json("/purchase", {
        method: "POST",
        body: { quantity: 3 },
      }),
    ).rejects.toBeInstanceOf(SaasNotLinkedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });
  it("throws SaasUnconfiguredError when VITE_SAAS_API_URL is unset", async () => {
    vi.stubEnv("VITE_SAAS_API_URL", "");
    await expect(
      apiClient.saas.json("/api/v1/payg/wallet"),
    ).rejects.toBeInstanceOf(SaasUnconfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws SaasNotLinkedError when there is no SaaS session", async () => {
    vi.stubEnv("VITE_SAAS_API_URL", "https://saas.test.local");
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(
      apiClient.saas.json("/api/v1/payg/wallet"),
    ).rejects.toBeInstanceOf(SaasNotLinkedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches the Supabase bearer and hits the absolute SaaS base", async () => {
    vi.stubEnv("VITE_SAAS_API_URL", "https://saas.test.local");
    getSession.mockResolvedValue({
      data: { session: { access_token: "supabase_tok" } },
    });
    fetchMock.mockResolvedValue(ok({ status: "free" }));

    const body = await apiClient.saas.json<{ status: string }>(
      "/api/v1/payg/wallet",
    );

    expect(body.status).toBe("free");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://saas.test.local/api/v1/payg/wallet");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer supabase_tok",
    );
  });
});

describe("apiClient.local", () => {
  it("attaches the Spring admin bearer and stays same-origin", async () => {
    getStoredTokenMock.mockReturnValue("spring_tok");
    fetchMock.mockResolvedValue(ok({ linked: false }));

    await apiClient.local.json("/api/v1/account-link/status");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/account-link/status");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer spring_tok",
    );
  });

  it("returns undefined for a 204 response", async () => {
    getStoredTokenMock.mockReturnValue("spring_tok");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await apiClient.local.json("/api/v1/account-link/unlink", {
      method: "POST",
    });

    expect(result).toBeUndefined();
  });

  it("throws HttpError with the status and parsed body on non-2xx", async () => {
    getStoredTokenMock.mockReturnValue("spring_tok");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const err = await apiClient.local
      .json("/api/v1/account-link/status")
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(500);
    expect((err as HttpError).body).toEqual({ error: "nope" });
  });
});
