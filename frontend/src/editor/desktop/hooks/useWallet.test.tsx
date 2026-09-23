import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig } from "@app/services/connectionModeService";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  mode: null as ConnectionConfig["mode"] | null,
  listeners: new Set<(config: ConnectionConfig) => void>(),
}));

vi.mock("@app/services/apiClient", () => ({ default: { get: mocks.get } }));
vi.mock("@app/hooks/walletDevPreview", () => ({
  getWalletDevPreview: () => null,
}));
vi.mock("@app/services/billing", () => ({ createPortalSession: vi.fn() }));
vi.mock("@app/platform/openExternal", () => ({ openExternal: vi.fn() }));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedMode: () => mocks.mode,
    getCurrentMode: async () => mocks.mode ?? "selfhosted",
    subscribeToModeChanges: (listener: (config: ConnectionConfig) => void) => {
      mocks.listeners.add(listener);
      return () => mocks.listeners.delete(listener);
    },
  },
}));

import { useWallet } from "@app/hooks/useWallet";
import { createAppQueryClient } from "@app/query/queryClient";

/** The hook reads through the shared cache, so it needs the app's own client. */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createAppQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("desktop wallet connection mode", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.mode = null;
    mocks.get.mockReset();
  });

  afterEach(() => {
    // Unmount before real timers, or a live poll fires outside act.
    cleanup();
    vi.useRealTimers();
  });

  it.each([null, "local", "selfhosted"] as const)(
    "does not fetch or poll with mode %s",
    async (mode) => {
      mocks.mode = mode;
      const { result } = renderHook(() => useWallet(), { wrapper });

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(mocks.get).not.toHaveBeenCalled();
      expect(result.current.wallet).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    },
  );

  it("discards a pending cloud response and stops polling after switching to self-hosted", async () => {
    mocks.mode = "saas";
    let resolveWallet: (value: { data: { teamId: number } }) => void = () => {};
    mocks.get.mockReturnValue(
      new Promise((resolve) => {
        resolveWallet = resolve;
      }),
    );
    const { result } = renderHook(() => useWallet(), { wrapper });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));

    await act(async () => {
      mocks.mode = "selfhosted";
      mocks.listeners.forEach((listener) =>
        listener({
          mode: "selfhosted",
          server_config: { url: "http://localhost:8083" },
          lock_connection_mode: false,
        }),
      );
    });
    await act(async () => {
      resolveWallet({ data: { teamId: 1 } });
      vi.advanceTimersByTime(60_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(result.current.wallet).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
