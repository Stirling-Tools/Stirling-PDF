import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  refreshSession,
  invoke,
  rpc,
  getLinkedClient,
  ensureLinkClient,
  fetchMock,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  getLinkedClient: vi.fn(() => null),
  ensureLinkClient: vi.fn(() => null),
  fetchMock: vi.fn(),
}));

const login = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("@app/auth/redirectToLogin", () => ({
  redirectToLogin: login.redirect,
}));

vi.mock("@app/auth/supabase", () => ({
  supabase: {
    auth: { getSession, refreshSession },
    functions: { invoke },
    rpc,
  },
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: getLinkedClient,
}));
vi.mock("@app/portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: ensureLinkClient,
}));

import {
  getPortalSaasToken,
  resetPortalSaasSessionState,
} from "@app/portal/auth/portalSaasSession";
import {
  createPortalSession,
  getLatestBundleQuote,
} from "@app/portal/billing/stripe";
import { invokeSaasFunction } from "@app/portal/auth/saasFunctions";
import { fetchWallet } from "@app/portal/api/billing";
import { apiClient, SaasNotLinkedError } from "@app/portal/api/http";

describe("SaaS billing session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPortalSaasSessionState();
    vi.stubEnv("VITE_API_BASE_URL", "https://saas.example");
    vi.stubGlobal("fetch", fetchMock);
    getSession.mockResolvedValue({
      data: { session: { access_token: "signed-in-saas-token" } },
    });
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ teamId: 42 }), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("loads the wallet using the signed-in SaaS session without an instance link", async () => {
    expect(await fetchWallet()).toEqual({ teamId: 42 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://saas.example/api/v1/payg/wallet",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer signed-in-saas-token",
        }),
      }),
    );
    expect(ensureLinkClient).not.toHaveBeenCalled();
    expect(getLinkedClient).not.toHaveBeenCalled();
  });

  it("renews a rejected SaaS login token and retries a wallet read once", async () => {
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "renewed-saas-token" } },
      error: null,
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(fetchWallet()).resolves.toEqual({ teamId: 42 });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer renewed-saas-token",
        }),
      }),
    );
    expect(getLinkedClient).not.toHaveBeenCalled();
  });

  it("never replays a rejected hosted billing mutation", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(
      apiClient.saas.json("/api/v1/payg/cap", {
        method: "PATCH",
        body: { capUsd: 100 },
      }),
    ).rejects.toBeInstanceOf(SaasNotLinkedError);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(refreshSession).not.toHaveBeenCalled();
    expect(login.redirect).toHaveBeenCalled();
  });

  it("reads the current SaaS session after its token changes", async () => {
    expect(await getPortalSaasToken()).toBe("signed-in-saas-token");
    getSession.mockResolvedValue({
      data: { session: { access_token: "refreshed-saas-token" } },
    });
    expect(await getPortalSaasToken()).toBe("refreshed-saas-token");
  });

  it("does not borrow an account-link session when the SaaS user signs out", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await getPortalSaasToken()).toBeNull();
    await expect(fetchWallet()).rejects.toBeInstanceOf(SaasNotLinkedError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(login.redirect).toHaveBeenCalled();
    expect(ensureLinkClient).not.toHaveBeenCalled();
  });
});

it("uses the hosted client for edge calls, billing management and quote RPCs", async () => {
  resetPortalSaasSessionState();
  getSession.mockResolvedValue({
    data: { session: { access_token: "hosted-token" } },
    error: null,
  });
  invoke.mockResolvedValue({
    data: { success: true, url: "https://billing.example/session" },
    error: null,
  });
  rpc.mockResolvedValue({ data: [], error: null, status: 200 });
  getLinkedClient.mockClear();
  ensureLinkClient.mockClear();
  await expect(
    invokeSaasFunction("quote-pdf", { method: "GET" }, true),
  ).resolves.toMatchObject({ error: null });
  await expect(
    createPortalSession({
      teamId: 42,
      returnUrl: "https://app.example/settings/billing",
    }),
  ).resolves.toBe("https://billing.example/session");
  await expect(getLatestBundleQuote(42)).resolves.toBeNull();
  expect(invoke).toHaveBeenLastCalledWith(
    "create-customer-portal-session",
    expect.objectContaining({
      headers: { Authorization: "Bearer hosted-token" },
    }),
  );
  expect(rpc).toHaveBeenCalledWith("payg_get_latest_bundle_quote", {
    p_team_id: 42,
  });
  expect(getLinkedClient).not.toHaveBeenCalled();
  expect(ensureLinkClient).not.toHaveBeenCalled();
});
