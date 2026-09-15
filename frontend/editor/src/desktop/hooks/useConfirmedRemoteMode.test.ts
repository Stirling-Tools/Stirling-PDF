import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentModeMock, subscribeToModeChangesMock } = vi.hoisted(() => ({
  getCurrentModeMock: vi.fn(),
  subscribeToModeChangesMock: vi.fn(),
}));

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: getCurrentModeMock,
    subscribeToModeChanges: subscribeToModeChangesMock,
  },
}));

import { useConfirmedRemoteMode } from "@app/hooks/useConfirmedRemoteMode";

describe("useConfirmedRemoteMode", () => {
  beforeEach(() => {
    getCurrentModeMock.mockReset();
    subscribeToModeChangesMock.mockReset();
    subscribeToModeChangesMock.mockReturnValue(() => {});
  });
  afterEach(() => vi.clearAllMocks());

  it("starts false before the mode resolves (pessimistic)", () => {
    getCurrentModeMock.mockReturnValue(new Promise<never>(() => {}));
    const { result } = renderHook(() => useConfirmedRemoteMode());
    expect(result.current).toBe(false);
  });

  it("stays false in local mode, where the bundled backend answers", async () => {
    getCurrentModeMock.mockResolvedValue("local");
    const { result } = renderHook(() => useConfirmedRemoteMode());
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it.each(["saas", "selfhosted"])(
    "becomes true once the mode is confirmed %s",
    async (mode) => {
      getCurrentModeMock.mockResolvedValue(mode);
      const { result } = renderHook(() => useConfirmedRemoteMode());
      await waitFor(() => expect(result.current).toBe(true));
    },
  );

  it("reacts to a later mode change", async () => {
    getCurrentModeMock.mockResolvedValue("local");
    let notify: ((cfg: { mode: string }) => void) | undefined;
    subscribeToModeChangesMock.mockImplementation(
      (cb: (cfg: { mode: string }) => void) => {
        notify = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useConfirmedRemoteMode());
    await act(async () => {});
    expect(result.current).toBe(false);

    await act(async () => notify?.({ mode: "selfhosted" }));
    expect(result.current).toBe(true);

    await act(async () => notify?.({ mode: "local" }));
    expect(result.current).toBe(false);
  });
});
