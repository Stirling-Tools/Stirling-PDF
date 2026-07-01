import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * api/http apiClient routing + error branches — the module exists specifically
 * to make portal→backend routing explicit after /v1/billing/wallet once fell
 * through to the local backend. The happy-path routing (saas hits the absolute
 * base with the Supabase bearer) is covered in api/link.test.ts; here we pin the
 * error/edge branches that gate the billing UI's error surface.
 */
const { getSession, getStoredTokenMock } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getStoredTokenMock: vi.fn(),
}));

vi.mock("@shared/auth", () => ({ getStoredToken: getStoredTokenMock }));
vi.mock("@shared/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => ({ auth: { getSession } }),
  configureSupabase: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));

import {
  apiClient,
  HttpError,
  SaasNotLinkedError,
  SaasUnconfiguredError,
} from "@portal/api/http";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  getSession.mockReset();
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
