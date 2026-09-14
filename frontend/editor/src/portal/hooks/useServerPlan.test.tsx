import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LicenseInfo } from "@app/types/license";
const state = vi.hoisted(() => ({
  licenseInfo: null as LicenseInfo | null,
  fetchUsers: vi.fn(),
}));
vi.mock("@app/contexts/LicenseContext", () => ({
  useLicense: () => ({ licenseInfo: state.licenseInfo, loading: false }),
}));
vi.mock("@app/portal/usersBackend", () => ({
  usersBackend: { fetchUsers: state.fetchUsers },
}));
import { useServerPlan } from "@portal/hooks/useServerPlan";

describe("local licence entitlements", () => {
  beforeEach(() => {
    state.licenseInfo = {
      licenseType: "ENTERPRISE",
      enabled: true,
      maxUsers: 250,
      hasKey: true,
    };
    state.fetchUsers
      .mockReset()
      .mockResolvedValue({ summary: { seatsUsed: 37 } });
  });
  it("uses the installed seats and local roster and refreshes after activation", async () => {
    const { result, rerender } = renderHook(() => useServerPlan(true));
    await waitFor(() => expect(result.current.serverPlan?.usersInUse).toBe(37));
    expect(result.current.serverPlan?.maxUsers).toBe(250);
    state.licenseInfo = { ...state.licenseInfo!, maxUsers: 500 };
    state.fetchUsers.mockResolvedValue({ summary: { seatsUsed: 45 } });
    rerender();
    await waitFor(() => expect(result.current.serverPlan?.usersInUse).toBe(45));
    expect(result.current.serverPlan?.maxUsers).toBe(500);
  });
  it("does not grant an inactive licence", () => {
    state.licenseInfo!.enabled = false;
    const { result } = renderHook(() => useServerPlan(true));
    expect(result.current.serverPlan).toBeUndefined();
    expect(state.fetchUsers).not.toHaveBeenCalled();
  });
  it("does not read licence seats for a non-admin", () => {
    const { result } = renderHook(() => useServerPlan(false));
    expect(result.current.serverPlan).toBeUndefined();
    expect(state.fetchUsers).not.toHaveBeenCalled();
  });
  it("keeps licensed capacity without inventing usage when the roster fails", async () => {
    state.fetchUsers.mockRejectedValue(new Error("unavailable"));
    const { result } = renderHook(() => useServerPlan(true));
    await waitFor(() => expect(state.fetchUsers).toHaveBeenCalled());
    expect(result.current.serverPlan).toEqual({
      licenseType: "ENTERPRISE",
      maxUsers: 250,
      usersInUse: null,
    });
  });
});
