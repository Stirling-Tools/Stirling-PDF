import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

const { getSession, refreshSession, state } = vi.hoisted(() => ({
  state: { configured: true },
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));
vi.mock("@app/portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: vi.fn(),
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () =>
    state.configured ? { auth: { getSession, refreshSession } } : null,
}));
import {
  getPortalSaasToken,
  getPortalSaasSessionState,
  resetPortalSaasSessionState,
  portalSaasSessionRestored,
  SaasSessionRequiredError,
  withPortalSaasSession,
} from "@app/portal/auth/portalSaasSession";

const session = (token: string | null) => ({
  data: { session: token ? { access_token: token } : null },
  error: null,
});

describe("attended SaaS session renewal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.configured = true;
    resetPortalSaasSessionState();
    getSession.mockResolvedValue(session("expired"));
    refreshSession.mockResolvedValue(session("renewed"));
  });

  it("returns null when the client is not configured", async () => {
    state.configured = false;
    expect(await getPortalSaasToken()).toBeNull();
  });

  it("returns the access token from the current session", async () => {
    getSession.mockResolvedValue(session("current"));
    expect(await getPortalSaasToken()).toBe("current");
  });

  it("returns null when the client has no session", async () => {
    getSession.mockResolvedValue(session(null));
    expect(await getPortalSaasToken()).toBeNull();
  });

  it("clears a previous recovery prompt after a read renews successfully", async () => {
    await expect(
      withPortalSaasSession(
        async () => 401,
        (status) => status === 401,
      ),
    ).rejects.toBeInstanceOf(SaasSessionRequiredError);
    expect(getPortalSaasSessionState().required).toBe(true);
    const revision = getPortalSaasSessionState().revision;
    const read = () =>
      withPortalSaasSession(
        async (token) => (token === "renewed" ? 200 : 401),
        (status) => status === 401,
        true,
      );
    expect(await read()).toBe(200);
    expect(getPortalSaasSessionState()).toEqual({
      required: false,
      revision: revision + 1,
    });
    expect(await read()).toBe(200);
    expect(getPortalSaasSessionState().revision).toBe(revision + 1);
  });

  it("clears recovery when an old request fails after the SDK has already renewed", async () => {
    let rejectOld!: (status: number) => void;
    const oldRequest = withPortalSaasSession(
      () =>
        new Promise<number>((resolve) => {
          rejectOld = resolve;
        }),
      (status) => status === 401,
    );
    const failure = expect(oldRequest).rejects.toBeInstanceOf(
      SaasSessionRequiredError,
    );
    await vi.waitFor(() => expect(rejectOld).toBeDefined());
    getSession.mockResolvedValue(session("renewed"));
    window.dispatchEvent(new Event("stirling-saas-session-restored"));
    rejectOld(401);
    await failure;
    expect(getPortalSaasSessionState().required).toBe(true);
    const read = vi.fn(async () => 200);
    await expect(
      withPortalSaasSession(read, (status) => status === 401, true),
    ).resolves.toBe(200);
    expect(read).toHaveBeenCalledWith("renewed");
    expect(refreshSession).not.toHaveBeenCalled();
    expect(getPortalSaasSessionState().required).toBe(false);
  });

  it("does not clear recovery for a server error using the same rejected token", async () => {
    await expect(
      withPortalSaasSession(
        async () => 401,
        (status) => status === 401,
      ),
    ).rejects.toBeInstanceOf(SaasSessionRequiredError);
    await expect(
      withPortalSaasSession(
        async () => 500,
        (status) => status === 401,
        true,
      ),
    ).resolves.toBe(500);
    expect(getPortalSaasSessionState().required).toBe(true);
  });

  it("publishes SDK recovery only when a prompt is outstanding", async () => {
    await expect(
      withPortalSaasSession(
        async () => 401,
        (status) => status === 401,
      ),
    ).rejects.toBeInstanceOf(SaasSessionRequiredError);
    const revision = getPortalSaasSessionState().revision;
    window.dispatchEvent(new Event("stirling-saas-session-restored"));
    expect(getPortalSaasSessionState()).toEqual({
      required: false,
      revision: revision + 1,
    });
    window.dispatchEvent(new Event("stirling-saas-session-restored"));
    expect(getPortalSaasSessionState().revision).toBe(revision + 1);
  });

  it("keeps a current owner's pending recovery valid when the callback publishes restoration", async () => {
    let resolve!: (value: ReturnType<typeof session>) => void;
    refreshSession.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const request = withPortalSaasSession(
      async (token) => (token === "renewed" ? 200 : 401),
      (status) => status === 401,
      true,
    );
    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalled());
    window.dispatchEvent(new Event("stirling-saas-session-restored"));
    portalSaasSessionRestored();
    resolve(session("renewed"));
    await expect(request).resolves.toBe(200);
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
