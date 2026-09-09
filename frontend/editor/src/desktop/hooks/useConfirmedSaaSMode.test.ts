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

import { useConfirmedSaaSMode } from "@app/hooks/useConfirmedSaaSMode";

describe("useConfirmedSaaSMode", () => {
  beforeEach(() => {
    getCurrentModeMock.mockReset();
    subscribeToModeChangesMock.mockReset();
    subscribeToModeChangesMock.mockReturnValue(() => {});
  });
  afterEach(() => vi.clearAllMocks());

  it("starts false before the mode resolves (pessimistic)", () => {
    getCurrentModeMock.mockReturnValue(new Promise<never>(() => {}));
    const { result } = renderHook(() => useConfirmedSaaSMode());
    expect(result.current).toBe(false);
  });

  it("becomes true once the mode is confirmed saas", async () => {
    getCurrentModeMock.mockResolvedValue("saas");
    const { result } = renderHook(() => useConfirmedSaaSMode());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("stays false in self-hosted mode", async () => {
    getCurrentModeMock.mockResolvedValue("selfhosted");
    const { result } = renderHook(() => useConfirmedSaaSMode());
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it("reacts to a later mode change", async () => {
    getCurrentModeMock.mockResolvedValue("selfhosted");
    let notify: ((cfg: { mode: string }) => void) | undefined;
    subscribeToModeChangesMock.mockImplementation(
      (cb: (cfg: { mode: string }) => void) => {
        notify = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useConfirmedSaaSMode());
    await act(async () => {});
    expect(result.current).toBe(false);

    await act(async () => notify?.({ mode: "saas" }));
    expect(result.current).toBe(true);
  });
});
