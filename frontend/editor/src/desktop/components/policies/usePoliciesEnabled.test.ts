import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthStatus } from "@app/services/authService";
import type { ConnectionMode } from "@app/services/connectionModeService";
const state = vi.hoisted(() => ({
  mode: "local" as ConnectionMode,
  authenticated: false,
  authListener: (_status: AuthStatus, _user?: { username: string }) => {},
  modeListener: () => {},
}));
vi.mock("@app/services/authService", () => ({
  authService: {
    isAuthenticated: vi.fn(async () => state.authenticated),
    subscribeToAuth: (listener: (status: AuthStatus) => void) => {
      state.authListener = listener;
      listener(state.authenticated ? "authenticated" : "unauthenticated");
      return () => {};
    },
  },
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedMode: () => null,
    getCurrentMode: vi.fn(async () => state.mode),
    subscribeToModeChanges: (listener: () => void) => {
      state.modeListener = listener;
      return () => {};
    },
  },
}));
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";

describe("desktop automation availability", () => {
  beforeEach(() => {
    state.mode = "local";
    state.authenticated = false;
  });
  test.each(["saas", "selfhosted"] as const)(
    "enables an authenticated %s connection only after resolving it",
    async (mode) => {
      state.mode = mode;
      state.authenticated = true;
      const { result } = renderHook(usePoliciesEnabled);
      expect(result.current).toBe(false);
      await waitFor(() => expect(result.current).toBe(true));
      act(() => {
        state.authenticated = false;
        state.authListener("unauthenticated");
      });
      expect(result.current).toBe(false);
      await act(async () => {});
    },
  );
  test("a saved connection without authentication stays disabled", async () => {
    state.mode = "selfhosted";
    const { result } = renderHook(usePoliciesEnabled);
    await act(async () => {});
    expect(result.current).toBe(false);
  });
  test("local mode stays disabled even if a token remains", async () => {
    state.authenticated = true;
    const { result } = renderHook(usePoliciesEnabled);
    await act(async () => {});
    expect(result.current).toBe(false);
  });
  test("token refresh does not unmount active processing", async () => {
    state.mode = "saas";
    state.authenticated = true;
    const { result } = renderHook(usePoliciesEnabled);
    await waitFor(() => expect(result.current).toBe(true));
    act(() => state.authListener("refreshing", { username: "demo" }));
    expect(result.current).toBe(true);
    await act(async () => {});
  });
});
