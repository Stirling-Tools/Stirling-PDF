import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCachedModeMock,
  getCurrentModeMock,
  subscribeToModeChangesMock,
  subscribeToAuthMock,
} = vi.hoisted(() => ({
  getCachedModeMock: vi.fn(),
  getCurrentModeMock: vi.fn(),
  subscribeToModeChangesMock: vi.fn(),
  subscribeToAuthMock: vi.fn(),
}));

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedMode: getCachedModeMock,
    getCurrentMode: getCurrentModeMock,
    subscribeToModeChanges: subscribeToModeChangesMock,
  },
}));
vi.mock("@app/services/authService", () => ({
  authService: { subscribeToAuth: subscribeToAuthMock },
}));

import { useConnectedServer } from "@app/hooks/useConnectedServer";

/** subscribeToAuth replays the current status on subscribe, as the real service does. */
function withAuthStatus(status: string, userInfo: unknown = null) {
  subscribeToAuthMock.mockImplementation(
    (cb: (s: string, u: unknown) => void) => {
      cb(status, userInfo);
      return () => {};
    },
  );
}

describe("useConnectedServer", () => {
  beforeEach(() => {
    getCachedModeMock.mockReset().mockReturnValue(null);
    getCurrentModeMock.mockReset();
    subscribeToModeChangesMock.mockReset().mockReturnValue(() => {});
    subscribeToAuthMock.mockReset();
    withAuthStatus("unauthenticated");
  });
  afterEach(() => vi.clearAllMocks());

  it("starts false before either signal resolves", () => {
    getCurrentModeMock.mockReturnValue(new Promise<never>(() => {}));
    const { result } = renderHook(() => useConnectedServer());
    expect(result.current).toBe(false);
  });

  it("is true when authenticated against a self-hosted server", async () => {
    withAuthStatus("authenticated", { username: "ada" });
    getCurrentModeMock.mockResolvedValue("selfhosted");
    const { result } = renderHook(() => useConnectedServer());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("is true when authenticated against Stirling Cloud", async () => {
    withAuthStatus("authenticated", { username: "ada" });
    getCurrentModeMock.mockResolvedValue("saas");
    const { result } = renderHook(() => useConnectedServer());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("is false in local mode even when authenticated", async () => {
    withAuthStatus("authenticated", { username: "ada" });
    getCurrentModeMock.mockResolvedValue("local");
    const { result } = renderHook(() => useConnectedServer());
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it("is false when signed out of a connected server", async () => {
    getCurrentModeMock.mockResolvedValue("selfhosted");
    const { result } = renderHook(() => useConnectedServer());
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it("stays true while a token refresh is in flight", async () => {
    let notifyAuth: ((s: string, u: unknown) => void) | undefined;
    subscribeToAuthMock.mockImplementation(
      (cb: (s: string, u: unknown) => void) => {
        notifyAuth = cb;
        cb("authenticated", { username: "ada" });
        return () => {};
      },
    );
    getCurrentModeMock.mockResolvedValue("saas");
    const { result } = renderHook(() => useConnectedServer());
    await waitFor(() => expect(result.current).toBe(true));

    await act(async () => notifyAuth?.("refreshing", { username: "ada" }));
    expect(result.current).toBe(true);
  });

  it("is connected when it mounts midway through a token refresh", async () => {
    // subscribeToAuth replays, so a fresh mount sees only "refreshing"; the live user
    // it carries is what separates that from a cold start.
    withAuthStatus("refreshing", { username: "ada" });
    getCurrentModeMock.mockResolvedValue("selfhosted");
    const { result } = renderHook(() => useConnectedServer());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("is not connected during an OAuth handshake, which carries no user", async () => {
    withAuthStatus("oauth_pending", null);
    getCurrentModeMock.mockResolvedValue("saas");
    const { result } = renderHook(() => useConnectedServer());
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it("drops to false when the session ends", async () => {
    let notifyAuth: ((s: string, u: unknown) => void) | undefined;
    subscribeToAuthMock.mockImplementation(
      (cb: (s: string, u: unknown) => void) => {
        notifyAuth = cb;
        cb("authenticated", { username: "ada" });
        return () => {};
      },
    );
    getCurrentModeMock.mockResolvedValue("selfhosted");
    const { result } = renderHook(() => useConnectedServer());
    await waitFor(() => expect(result.current).toBe(true));

    await act(async () => notifyAuth?.("unauthenticated", null));
    expect(result.current).toBe(false);
  });

  it("reacts to a later switch onto a server", async () => {
    withAuthStatus("authenticated", { username: "ada" });
    getCurrentModeMock.mockResolvedValue("local");
    let notifyMode: ((cfg: { mode: string }) => void) | undefined;
    subscribeToModeChangesMock.mockImplementation(
      (cb: (cfg: { mode: string }) => void) => {
        notifyMode = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useConnectedServer());
    await act(async () => {});
    expect(result.current).toBe(false);

    await act(async () => notifyMode?.({ mode: "selfhosted" }));
    expect(result.current).toBe(true);
  });

  it("seeds from the cached mode so a remount answers on its first frame", () => {
    withAuthStatus("authenticated", { username: "ada" });
    getCachedModeMock.mockReturnValue("saas");
    getCurrentModeMock.mockReturnValue(new Promise<never>(() => {}));
    const { result } = renderHook(() => useConnectedServer());
    expect(result.current).toBe(true);
  });
});
