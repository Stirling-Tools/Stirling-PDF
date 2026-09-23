import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LicenseInfo } from "@app/types/license";
import { BillingScreen } from "@app/billing/BillingScreen";
import { freeWallet } from "@app/billing/walletFixtures";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, vars?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_match, key) =>
        String(vars?.[key] ?? ""),
      ),
  }),
}));
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
      licenseKey: "installed-enterprise-key",
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
    expect(state.fetchUsers).toHaveBeenCalled();
  });
  it.each([undefined, "", "00000000-0000-0000-0000-000000000000"])(
    "keeps keyless SERVER features on Team billing with key %s",
    async (licenseKey) => {
      state.licenseInfo = {
        licenseType: "SERVER",
        enabled: true,
        maxUsers: 200,
        hasKey: Boolean(licenseKey),
        licenseKey,
      };
      const addCapacity = vi.fn();
      function LinkedTeamBilling() {
        const { serverPlan, usersInUse } = useServerPlan(true);
        return (
          <BillingScreen
            selfHosted
            serverPlan={serverPlan}
            usersInUse={usersInUse}
            wallet={{
              ...freeWallet,
              team: { held: true, licensedUsers: 200, usersInUse: 40 },
            }}
            onAddCapacity={addCapacity}
          />
        );
      }
      render(<LinkedTeamBilling />);
      expect(screen.getByText("Team")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByText("37 of 200 users")).toBeInTheDocument(),
      );
      expect(screen.queryByText("Server")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Add capacity" }));
      expect(addCapacity).toHaveBeenCalledOnce();
      expect(state.licenseInfo.licenseType).toBe("SERVER");
      expect(state.fetchUsers).toHaveBeenCalled();
    },
  );
  it.each(["installed-server-key", "file:/licenses/server.cert"])(
    "keeps installed Server billing for %s",
    async (licenseKey) => {
      state.licenseInfo = {
        licenseType: "SERVER",
        enabled: true,
        maxUsers: 9999,
        hasKey: true,
        licenseKey,
      };
      const { result } = renderHook(() => useServerPlan(true));
      await waitFor(() =>
        expect(result.current.serverPlan).toEqual({
          licenseType: "SERVER",
          maxUsers: 9999,
          usersInUse: 37,
        }),
      );
    },
  );
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
