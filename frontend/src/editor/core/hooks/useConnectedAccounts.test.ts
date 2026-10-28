// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchConnectedAccounts = vi.fn();
vi.mock("@editor/services/connectedAccountsService", () => ({
  fetchConnectedAccounts: () => fetchConnectedAccounts(),
  connectAccount: vi.fn(),
  disconnectAccount: vi.fn(),
}));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: {} }),
}));

const {
  latestConnectedAccounts,
  refreshConnectedAccounts,
  resetConnectedAccountsForTests,
} = await import("@editor/hooks/useConnectedAccounts");

describe("refreshConnectedAccounts", () => {
  beforeEach(() => {
    resetConnectedAccountsForTests();
    fetchConnectedAccounts.mockReset();
  });

  it("keeps the known accounts when a refresh fails", async () => {
    const accounts = [{ id: 3, provider: "microsoft", status: "CONNECTED" }];
    fetchConnectedAccounts.mockResolvedValueOnce({
      providers: { microsoft: true, google: false },
      accounts,
    });
    await refreshConnectedAccounts();
    fetchConnectedAccounts.mockRejectedValueOnce(new Error("503"));
    await refreshConnectedAccounts();

    expect(latestConnectedAccounts()).toEqual(accounts);
  });
});
