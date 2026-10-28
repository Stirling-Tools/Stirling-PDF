import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchConnectedAccounts = vi.fn();
const disconnectAccount = vi.fn();
vi.mock("@editor/services/connectedAccountsService", () => ({
  fetchConnectedAccounts: () => fetchConnectedAccounts(),
  connectAccount: vi.fn(),
  disconnectAccount: (id: number) => disconnectAccount(id),
}));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { microsoftAccountConnections: true } }),
}));

const {
  clearConnectedAccounts,
  refreshConnectedAccounts,
  useConnectedAccounts,
} = await import("@editor/hooks/useConnectedAccounts");

describe("disconnecting a connected account", () => {
  beforeEach(() => {
    clearConnectedAccounts();
    fetchConnectedAccounts.mockReset();
    disconnectAccount.mockReset();
  });

  it("removes it even when the refresh afterwards fails", async () => {
    fetchConnectedAccounts.mockResolvedValue({
      providers: { microsoft: true, google: false },
      accounts: [
        { id: 3, provider: "microsoft", status: "CONNECTED" },
        { id: 4, provider: "microsoft", status: "CONNECTED" },
      ],
    });
    await refreshConnectedAccounts();
    const { result } = renderHook(() => useConnectedAccounts());
    disconnectAccount.mockResolvedValueOnce(undefined);
    fetchConnectedAccounts.mockRejectedValueOnce(new Error("503"));

    await act(() => result.current.disconnect(3));

    expect(result.current.accounts.map((account) => account.id)).toEqual([4]);
  });

  it("keeps it when the disconnect itself fails", async () => {
    fetchConnectedAccounts.mockResolvedValue({
      providers: { microsoft: true, google: false },
      accounts: [{ id: 3, provider: "microsoft", status: "CONNECTED" }],
    });
    await refreshConnectedAccounts();
    const { result } = renderHook(() => useConnectedAccounts());
    disconnectAccount.mockRejectedValueOnce(new Error("500"));

    await act(async () => {
      await expect(result.current.disconnect(3)).rejects.toThrow("500");
    });

    expect(result.current.accounts.map((account) => account.id)).toEqual([3]);
  });
});
