import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getCurrentMode = vi.fn();
const subscribeToModeChanges = vi.fn((_cb: unknown) => () => {});

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: () => getCurrentMode(),
    subscribeToModeChanges: (cb: unknown) => subscribeToModeChanges(cb),
  },
}));

const { useRosterAvailable } = await import("@app/hooks/useRosterAvailable");

describe("useRosterAvailable (desktop)", () => {
  beforeEach(() => {
    getCurrentMode.mockReset();
    subscribeToModeChanges.mockClear();
  });

  it("offers nothing while the mode is still unknown", () => {
    getCurrentMode.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRosterAvailable());
    expect(result.current).toBe(false);
  });

  it("withholds the roster in local mode, which is signed into nothing", async () => {
    getCurrentMode.mockResolvedValue("local");
    const { result } = renderHook(() => useRosterAvailable());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("serves it once connected to a server", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    const { result } = renderHook(() => useRosterAvailable());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("serves it once signed into the cloud", async () => {
    getCurrentMode.mockResolvedValue("saas");
    const { result } = renderHook(() => useRosterAvailable());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
