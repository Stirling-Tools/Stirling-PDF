import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestQueryProvider } from "@portal/test/TestQueryProvider";
import { useFreeTierBalance } from "@portal/hooks/useFreeTierBalance";
import {
  clearAccountLinkBlock,
  reportFreeTierExhausted,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  gated: true,
  fetchFreeTier: vi.fn(),
}));
vi.mock("@app/auth", () => ({ useAuth: () => ({ isAdmin: mocks.isAdmin }) }));
vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({ gated: mocks.gated, loading: false }),
}));
vi.mock("@portal/api/link", () => ({ fetchFreeTier: mocks.fetchFreeTier }));
const balance = (remainingUnits: number) => ({
  grantUnits: 500,
  remainingUnits,
  usedUnits: 500 - remainingUnits,
  periodStart: "2026-09-01T00:00:00",
  periodEnd: "2026-10-01T00:00:00",
});

describe("local allowance refresh", () => {
  beforeEach(() => {
    clearAccountLinkBlock();
    mocks.isAdmin = true;
    mocks.gated = true;
    mocks.fetchFreeTier.mockReset().mockResolvedValue(balance(500));
  });

  it("does not request server-wide figures for members or linked accounts", () => {
    mocks.isAdmin = false;
    const probe = renderHook(() => useFreeTierBalance(), {
      wrapper: TestQueryProvider,
    });
    expect(mocks.fetchFreeTier).not.toHaveBeenCalled();
    mocks.isAdmin = true;
    mocks.gated = false;
    probe.rerender();
    expect(mocks.fetchFreeTier).not.toHaveBeenCalled();
    expect(probe.result.current.data).toBeUndefined();
  });

  it("refreshes on exhaustion and clears the notice when the allowance renews", async () => {
    const probe = renderHook(
      () => ({ ledger: useFreeTierBalance(), block: useAccountLinkBlock() }),
      { wrapper: TestQueryProvider },
    );
    await waitFor(() =>
      expect(probe.result.current.ledger.data?.remainingUnits).toBe(500),
    );
    mocks.fetchFreeTier.mockResolvedValue(balance(0));
    act(() => reportFreeTierExhausted("background"));
    await waitFor(() =>
      expect(probe.result.current.ledger.data?.remainingUnits).toBe(0),
    );
    expect(probe.result.current.block.exhausted).toBe(true);
    expect(probe.result.current.block.promptPending).toBe(false);
    mocks.fetchFreeTier.mockResolvedValue(balance(500));
    await act(async () => {
      await probe.result.current.ledger.refetch();
    });
    await waitFor(() =>
      expect(probe.result.current.block.exhausted).toBe(false),
    );
  });

  it("keeps an authoritative block when refreshing an older positive balance fails", async () => {
    const probe = renderHook(
      () => ({ ledger: useFreeTierBalance(), block: useAccountLinkBlock() }),
      { wrapper: TestQueryProvider },
    );
    await waitFor(() =>
      expect(probe.result.current.ledger.data?.remainingUnits).toBe(500),
    );
    mocks.fetchFreeTier.mockRejectedValue(new Error("offline"));
    act(() => reportFreeTierExhausted("background"));
    await waitFor(() => expect(probe.result.current.ledger.isError).toBe(true));
    expect(probe.result.current.block.exhausted).toBe(true);
    expect(probe.result.current.ledger.data).toBeUndefined();
  });
});
