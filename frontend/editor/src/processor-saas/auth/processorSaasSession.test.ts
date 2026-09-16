import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, getLinkedClient, ensureLinkClient, fetchMock } = vi.hoisted(
  () => ({
    getSession: vi.fn(),
    getLinkedClient: vi.fn(() => null),
    ensureLinkClient: vi.fn(() => null),
    fetchMock: vi.fn(),
  }),
);

vi.mock("@app/auth/supabase", () => ({ supabase: { auth: { getSession } } }));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: getLinkedClient,
}));
vi.mock("@processor/auth/saasSupabase", () => ({
  ensureSaasSupabase: ensureLinkClient,
}));

import { getProcessorSaasToken } from "@processor/auth/processorSaasSession";
import { fetchWallet } from "@processor/api/billing";
import { SaasNotLinkedError } from "@processor/api/http";

describe("SaaS billing session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("reads the current SaaS session after its token changes", async () => {
    expect(await getProcessorSaasToken()).toBe("signed-in-saas-token");
    getSession.mockResolvedValue({
      data: { session: { access_token: "refreshed-saas-token" } },
    });
    expect(await getProcessorSaasToken()).toBe("refreshed-saas-token");
  });

  it("does not borrow an account-link session when the SaaS user signs out", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await getProcessorSaasToken()).toBeNull();
    await expect(fetchWallet()).rejects.toBeInstanceOf(SaasNotLinkedError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ensureLinkClient).not.toHaveBeenCalled();
  });
});
