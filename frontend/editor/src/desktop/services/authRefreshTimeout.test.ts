import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, postMock, axiosPostMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  postMock: vi.fn(),
  axiosPostMock: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { post: axiosPostMock, get: vi.fn(), isAxiosError: () => false },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: () => true,
}));
vi.mock("@app/services/tauriHttpClient", () => ({
  default: { post: postMock, get: vi.fn() },
  tauriHttpClient: { post: postMock, get: vi.fn() },
}));

import { authService } from "@app/services/authService";
import { expectConsole } from "@app/tests/failOnConsole";

/** A keyring read blocks on an OS prompt, so nothing waiting on one may hang forever. */
describe("keyring timeouts", () => {
  beforeEach(() => {
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
  });
});
