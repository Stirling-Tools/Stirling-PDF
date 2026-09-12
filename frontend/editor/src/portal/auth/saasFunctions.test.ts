import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
const { invoke, getSession, refreshSession } = vi.hoisted(() => ({
  invoke: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: { getSession, refreshSession },
    functions: { invoke },
  }),
}));
import { invokeSaasFunction } from "@portal/auth/saasFunctions";
import {
  resetPortalSaasSessionState,
  SaasSessionRequiredError,
} from "@portal/auth/portalSaasSession";

describe("SaaS edge session recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPortalSaasSessionState();
    getSession.mockResolvedValue({
      data: { session: { access_token: "old" } },
    });
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "renewed" } },
    });
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(null, { status: 401 })),
    });
  });

  it("retries a quote download with the refreshed bearer", async () => {
    invoke
      .mockResolvedValueOnce({
        data: null,
        error: new FunctionsHttpError(new Response(null, { status: 401 })),
      })
      .mockResolvedValueOnce({ data: "pdf", error: null });
    const result = await invokeSaasFunction(
      "quote-pdf",
      { method: "GET" },
      true,
    );
    expect(result.data).toBe("pdf");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer renewed",
    );
  });

  it("requires renewal without automatically replaying checkout", async () => {
    await expect(
      invokeSaasFunction("checkout", { body: { seats: 3 } }),
    ).rejects.toBeInstanceOf(SaasSessionRequiredError);
    expect(invoke).toHaveBeenCalledOnce();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
