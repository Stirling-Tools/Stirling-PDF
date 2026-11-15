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

function accountsState(...ids: number[]) {
  return {
    providers: { microsoft: true, google: false },
    accounts: ids.map((id) => ({
      id,
      provider: "microsoft",
      status: "CONNECTED",
    })),
  };
}

describe("disconnecting a connected account", () => {
  beforeEach(() => {
    clearConnectedAccounts();
    fetchConnectedAccounts.mockReset();
    disconnectAccount.mockReset();
  });

  it("removes it even when the refresh afterwards fails", async () => {
    fetchConnectedAccounts.mockResolvedValue(accountsState(3, 4));
    await refreshConnectedAccounts();
    const { result } = renderHook(() => useConnectedAccounts());
    disconnectAccount.mockResolvedValueOnce(undefined);
    fetchConnectedAccounts.mockRejectedValueOnce(new Error("503"));

    await act(() => result.current.disconnect(3));

    expect(result.current.accounts.map((account) => account.id)).toEqual([4]);
  });

  it("keeps it when the disconnect itself fails", async () => {
    fetchConnectedAccounts.mockResolvedValue(accountsState(3));
    await refreshConnectedAccounts();
    const { result } = renderHook(() => useConnectedAccounts());
    disconnectAccount.mockRejectedValueOnce(new Error("500"));

    await act(async () => {
      await expect(result.current.disconnect(3)).rejects.toThrow("500");
    });

    expect(result.current.accounts.map((account) => account.id)).toEqual([3]);
  });

  it("ignores a refresh that started before the disconnect finished", async () => {
    const both = accountsState(3, 4);
    fetchConnectedAccounts.mockResolvedValueOnce(both);
    await refreshConnectedAccounts();
    const { result } = renderHook(() => useConnectedAccounts());

    let finishStale: (value: typeof both) => void = () => undefined;
    fetchConnectedAccounts.mockReturnValueOnce(
      new Promise((resolve) => (finishStale = resolve)),
    );
    void refreshConnectedAccounts();
    disconnectAccount.mockResolvedValueOnce(undefined);
    fetchConnectedAccounts.mockResolvedValueOnce(accountsState(4));

    await act(() => result.current.disconnect(3));
    await act(async () => finishStale(both));

    expect(result.current.accounts.map((account) => account.id)).toEqual([4]);
  });

  it("publishes nothing when the user signed out during the disconnect", async () => {
    fetchConnectedAccounts.mockResolvedValueOnce(accountsState(3));
    await refreshConnectedAccounts();
    const { result } = renderHook(() => useConnectedAccounts());
    let finishDisconnect: () => void = () => undefined;
    disconnectAccount.mockReturnValueOnce(
      new Promise<void>((resolve) => (finishDisconnect = resolve)),
    );
    fetchConnectedAccounts.mockClear();

    const pending = result.current.disconnect(3);
    act(() => clearConnectedAccounts());
    await act(async () => {
      finishDisconnect();
      await pending;
    });

    expect(result.current.accounts).toEqual([]);
    expect(fetchConnectedAccounts).not.toHaveBeenCalled();
  });
});
