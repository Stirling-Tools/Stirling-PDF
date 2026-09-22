import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, postMock, axiosPostMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  postMock: vi.fn(),
  axiosPostMock: vi.fn(),
}));

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return {
    ...actual,
    default: { ...actual.default, post: axiosPostMock, get: vi.fn() },
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: () => true,
}));
vi.mock("@app/services/tauriHttpClient", () => ({
  default: { post: postMock, get: vi.fn() },
  tauriHttpClient: { post: postMock, get: vi.fn() },
}));

import { AuthService } from "@app/services/authService";
import { expectConsole } from "@app/tests/failOnConsole";

/** A keyring read blocks on an OS prompt, so nothing waiting on one may hang forever. */
describe("keyring timeouts", () => {
  let authService: AuthService;
  beforeEach(() => {
    authService = new AuthService();
    localStorage.clear();
    vi.useFakeTimers();
    invokeMock.mockReset();
    postMock.mockReset();
    axiosPostMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("settles the boot gate when the keyring read never returns", async () => {
    // The exact shape of the hang we hit: invoke() never resolves.
    invokeMock.mockImplementation(() => new Promise(() => {}));

    expectConsole.warn(/Token read timed out/);
    const check = authService.isAuthenticated();
    await vi.advanceTimersByTimeAsync(25_000);

    await expect(check).resolves.toBe(false);
  });

  it("settles a refresh as signed out when the keyring read never returns", async () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));

    expectConsole.warn(/Token read timed out/);
    const refresh = authService.refreshToken("https://server.test");
    await vi.advanceTimersByTimeAsync(25_000);

    await expect(refresh).resolves.toBe(false);
  });

  it("releases waiters so the app can render instead of parking on the placeholder", async () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));

    expectConsole.warn(/Token read timed out/);
    const refresh = authService.refreshToken("https://server.test");
    const waiter = authService.awaitRefreshIfInProgress();
    await vi.advanceTimersByTimeAsync(25_000);

    await expect(refresh).resolves.toBe(false);
    await expect(waiter).resolves.toBe(false);
  });

  it("clears the in-flight guard, so a later refresh is not blocked by the dead one", async () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));
    expectConsole.warn(/Token read timed out/);
    const first = authService.refreshToken("https://server.test");
    await vi.advanceTimersByTimeAsync(25_000);
    await first;

    // A second attempt must start its own refresh rather than returning the stale promise.
    invokeMock.mockResolvedValue(null);
    await expect(authService.refreshToken("https://server.test")).resolves.toBe(
      false,
    );
  });

  it("bounds the Supabase refresh request, the call that gates the desktop boot", async () => {
    invokeMock.mockResolvedValue("stored-refresh-token");
    axiosPostMock.mockImplementation(() => new Promise(() => {}));

    expectConsole.warn(/Refresh timed out/);
    const refresh = authService.refreshSupabaseToken("https://auth.test");
    await vi.advanceTimersByTimeAsync(25_000);

    await expect(refresh).resolves.toBe(false);
    expect(axiosPostMock.mock.calls[0]?.[2]).toMatchObject({
      timeout: expect.any(Number),
    });
  });

  it("settles a refresh whose server never answers, once the keyring has returned", async () => {
    invokeMock.mockResolvedValue("stored-token");
    postMock.mockImplementation(() => new Promise(() => {}));

    expectConsole.warn(/Refresh timed out/);
    const refresh = authService.refreshToken("https://server.test");
    await vi.advanceTimersByTimeAsync(25_000);

    await expect(refresh).resolves.toBe(false);
    expect(postMock.mock.calls[0]?.[2].signal.aborted).toBe(true);
  });
});

describe.each(["self-hosted", "Supabase"] as const)(
  "%s refresh recovery",
  (provider) => {
    let authService: AuthService;
    const request = provider === "Supabase" ? axiosPostMock : postMock;
    const refresh = () =>
      provider === "Supabase"
        ? authService.refreshSupabaseToken("https://auth.test")
        : authService.refreshToken("https://server.test");
    const success = {
      data: {
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
      },
    };

    beforeEach(() => {
      vi.useFakeTimers();
      authService = new AuthService();
      invokeMock.mockReset();
      postMock.mockReset();
      axiosPostMock.mockReset();
      localStorage.clear();
      localStorage.setItem("stirling_jwt", "stored-access-token");
      localStorage.setItem("stirling_refresh_token", "stored-refresh-token");
      invokeMock.mockImplementation(async (command: string) => {
        if (command === "get_auth_token") return "stored-access-token";
        if (command === "get_refresh_token") return "stored-refresh-token";
        if (command === "get_user_info") return { username: "tester" };
        return null;
      });
    });
    afterEach(() => vi.useRealTimers());

    it.each([
      ["timeout", { code: "ECONNABORTED" }],
      ["network failure", { code: "ERR_NETWORK" }],
      ["server error", { response: { status: 503 } }],
      ["rate limit", { response: { status: 429 } }],
      [
        "unrelated bad request",
        { response: { status: 400, data: { error: "bad_json" } } },
      ],
      ["permission error", { response: { status: 403 } }],
    ])("preserves credentials after a %s", async (_label, details) => {
      request.mockRejectedValue({ isAxiosError: true, ...details });
      expectConsole.error(/token refresh failed/i);
      const listener = vi.fn();
      authService.subscribeToAuth(listener);

      await expect(refresh()).resolves.toBe(false);

      expect(listener).toHaveBeenLastCalledWith("unauthenticated", null);
      expect(localStorage.getItem("stirling_jwt")).toBe("stored-access-token");
      expect(localStorage.getItem("stirling_refresh_token")).toBe(
        "stored-refresh-token",
      );
      expect(
        invokeMock.mock.calls.some(([command]) => command.startsWith("clear_")),
      ).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      { status: 401 },
      { status: 400, data: { error: "invalid_grant" } },
      { status: 400, data: { error_code: "refresh_token_not_found" } },
      { status: 400, data: { code: "refresh_token_already_used" } },
    ])("clears credentials after confirmed rejection: %j", async (response) => {
      request.mockRejectedValue({ isAxiosError: true, response });
      expectConsole.error(/token refresh failed/i);

      await expect(refresh()).resolves.toBe(false);

      expect(invokeMock).toHaveBeenCalledWith("clear_auth_token");
      expect(invokeMock).toHaveBeenCalledWith("clear_refresh_token");
      expect(localStorage.getItem("stirling_jwt")).toBeNull();
      expect(localStorage.getItem("stirling_refresh_token")).toBeNull();
      expect(request).toHaveBeenCalledTimes(1);
    });

    it("cancels timed-out requests before allowing a retry", async () => {
      let activeRequests = 0;
      request.mockImplementation(
        (_url, _body, { signal }) =>
          new Promise((_resolve, reject) => {
            activeRequests += 1;
            signal.addEventListener(
              "abort",
              () => {
                activeRequests -= 1;
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          }),
      );
      expectConsole.warn(/Refresh timed out/);
      expectConsole.error(/token refresh failed/i);

      const first = refresh();
      const waiter = authService.awaitRefreshIfInProgress();
      await vi.advanceTimersByTimeAsync(20_000);

      await expect(first).resolves.toBe(false);
      await expect(waiter).resolves.toBe(false);
      expect(activeRequests).toBe(0);
      expect(request.mock.calls[0][2].signal.aborted).toBe(true);
      expect(localStorage.getItem("stirling_refresh_token")).toBe(
        "stored-refresh-token",
      );

      request.mockResolvedValueOnce(success);
      vi.spyOn(authService, "getAuthToken").mockResolvedValue(
        "stored-access-token",
      );
      await expect(refresh()).resolves.toBe(true);
      expect(request).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("does not send a refresh after an abandoned credential read returns", async () => {
      let finishRead!: (token: string) => void;
      const read = new Promise<string>((resolve) => {
        finishRead = resolve;
      });
      if (provider === "Supabase") {
        invokeMock.mockReturnValueOnce(read);
      } else {
        vi.spyOn(authService, "getAuthToken").mockReturnValueOnce(read);
      }
      expectConsole.warn(/Refresh timed out/);
      const pending = refresh();
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(pending).resolves.toBe(false);

      finishRead("late-token");
      await vi.advanceTimersByTimeAsync(0);

      expect(request).not.toHaveBeenCalled();
    });

    it.each(["success", "failure"])(
      "ignores a late %s from an expired request",
      async (outcome) => {
        let finish!: () => void;
        request.mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              finish = () =>
                outcome === "success"
                  ? resolve(success)
                  : reject({ isAxiosError: true, response: { status: 401 } });
            }),
        );
        expectConsole.warn(/Refresh timed out/);
        const pending = refresh();
        await vi.advanceTimersByTimeAsync(20_000);
        await expect(pending).resolves.toBe(false);

        localStorage.setItem("stirling_jwt", "new-session-token");
        const listener = vi.fn();
        authService.subscribeToAuth(listener);
        listener.mockClear();
        invokeMock.mockClear();
        if (outcome === "failure") expectConsole.error(/token refresh failed/i);
        finish();
        await vi.advanceTimersByTimeAsync(0);

        expect(localStorage.getItem("stirling_jwt")).toBe("new-session-token");
        expect(invokeMock).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
      },
    );
  },
);
