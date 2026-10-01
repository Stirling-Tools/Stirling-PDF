import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationsAvailable } from "@app/components/notifications/useNotificationsAvailable";
import {
  connectionModeService,
  type ConnectionConfig,
  type ConnectionMode,
} from "@app/services/connectionModeService";

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: vi.fn(),
    subscribeToModeChanges: vi.fn(),
  },
}));

describe("desktop notification availability", () => {
  let notify: (cfg: ConnectionConfig) => void;
  const unsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectionModeService.subscribeToModeChanges).mockImplementation(
      (listener) => {
        notify = listener;
        return unsubscribe;
      },
    );
  });

  it.each(["local", "saas", "selfhosted"] as const)(
    "waits for the mode, then enables notifications only for a server (%s)",
    async (mode) => {
      vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(mode);
      const { result, unmount } = renderHook(() => useNotificationsAvailable());
      expect(result.current).toBe(false);
      await act(async () => {});
      expect(result.current).toBe(mode !== "local");
      unmount();
      expect(unsubscribe).toHaveBeenCalledOnce();
    },
  );

  it("a late initial mode cannot restart polling after switching to local", async () => {
    let resolveMode: (mode: ConnectionMode) => void = () => {};
    vi.mocked(connectionModeService.getCurrentMode).mockReturnValue(
      new Promise((resolve) => {
        resolveMode = resolve;
      }),
    );
    const { result } = renderHook(() => useNotificationsAvailable());
    await act(async () => {
      notify({
        mode: "local",
        server_config: null,
        lock_connection_mode: false,
      });
      resolveMode("saas");
    });
    expect(result.current).toBe(false);

    await act(async () => {
      notify({
        mode: "saas",
        server_config: null,
        lock_connection_mode: false,
      });
    });
    expect(result.current).toBe(true);
    await act(async () => {
      notify({
        mode: "local",
        server_config: null,
        lock_connection_mode: false,
      });
    });
    expect(result.current).toBe(false);
  });
});
