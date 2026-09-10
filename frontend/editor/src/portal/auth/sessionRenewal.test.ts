import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

const { getSession, refreshSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => ({ auth: { getSession, refreshSession } }),
}));
import {
  getPortalSaasToken,
  getPortalSaasSessionState,
  resetPortalSaasSessionState,
  SaasSessionRequiredError,
  withPortalSaasSession,
} from "@portal/auth/portalSaasSession";

const session = (token: string | null) => ({
  data: { session: token ? { access_token: token } : null },
  error: null,
});

describe("attended SaaS session renewal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPortalSaasSessionState();
    getSession.mockResolvedValue(session("expired"));
    refreshSession.mockResolvedValue(session("renewed"));
  });

  it("coalesces concurrent 401s and retries reads with the renewed token", async () => {
    const send = vi.fn(async (token: string) =>
      token === "renewed" ? 200 : 401,
    );
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        withPortalSaasSession(send, (status) => status === 401, true),
      ),
    );
    expect(results).toEqual([200, 200, 200, 200, 200]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(10);
  });

  it("uses a token the SDK has already refreshed", async () => {
    getSession
      .mockResolvedValueOnce(session("expired"))
      .mockResolvedValue(session("renewed"));
    const send = vi.fn(async (token: string) =>
      token === "renewed" ? 200 : 401,
    );
    expect(
      await withPortalSaasSession(send, (status) => status === 401, true),
    ).toBe(200);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("requires reauthentication after a second 401 and stops retrying", async () => {
    const send = vi.fn(async () => 401);
    await expect(
      withPortalSaasSession(send, (status) => status === 401, true),
    ).rejects.toBeInstanceOf(SaasSessionRequiredError);
    expect(send).toHaveBeenCalledTimes(2);
    expect(getPortalSaasSessionState().required).toBe(true);
  });

  it("never replays purchases after a 401", async () => {
    const send = vi.fn(async () => 401);
    await expect(
      withPortalSaasSession(send, (status) => status === 401),
    ).rejects.toBeInstanceOf(SaasSessionRequiredError);
    expect(send).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it.each([403, 500, 429])(
    "does not treat HTTP %i as an expired session",
    async (status) => {
      expect(
        await withPortalSaasSession(
          async () => status,
          (response) => response === 401,
          true,
        ),
      ).toBe(status);
      expect(refreshSession).not.toHaveBeenCalled();
      expect(getPortalSaasSessionState().required).toBe(false);
    },
  );

  it("preserves transient SDK errors instead of requesting a sign-in", async () => {
    const error = new AuthRetryableFetchError("offline", 503);
    getSession.mockResolvedValue({ data: { session: null }, error });
    await expect(getPortalSaasToken()).rejects.toBe(error);
    expect(getPortalSaasSessionState().required).toBe(false);
  });

  it("recognizes a revoked refresh token as requiring reauthentication", async () => {
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("revoked", 400, "refresh_token_not_found"),
    });
    await expect(
      withPortalSaasSession(
        async () => 401,
        (status) => status === 401,
        true,
      ),
    ).rejects.toBeInstanceOf(SaasSessionRequiredError);
  });

  it("does not retry a transport failure", async () => {
    const send = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(
      withPortalSaasSession(send, () => false, true),
    ).rejects.toThrow("offline");
    expect(send).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("discards a refresh that finishes after the local user changed", async () => {
    let resolve!: (value: ReturnType<typeof session>) => void;
    refreshSession.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const send = vi.fn(async () => 401);
    const request = withPortalSaasSession(
      send,
      (status) => status === 401,
      true,
    );
    const rejection = expect(request).rejects.toBeInstanceOf(
      SaasSessionRequiredError,
    );
    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalled());
    resetPortalSaasSessionState();
    resolve(session("previous-owner"));
    await rejection;
    expect(send).toHaveBeenCalledTimes(1);
    expect(getPortalSaasSessionState().required).toBe(false);
  });
});
