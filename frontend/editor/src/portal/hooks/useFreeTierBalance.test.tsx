import { Profiler, type ReactNode } from "react";
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { baseQueryOptions } from "@app/query/queryClient";
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
    sessionStorage.clear();
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
    act(() => reportFreeTierExhausted());
    await waitFor(() =>
      expect(probe.result.current.ledger.data?.remainingUnits).toBe(0),
    );
    expect(probe.result.current.block.exhausted).toBe(true);
    expect(probe.result.current.block.promptPending).toBe(true);
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
    act(() => reportFreeTierExhausted());
    await waitFor(() => expect(probe.result.current.ledger.isError).toBe(true));
    expect(probe.result.current.block.exhausted).toBe(true);
    expect(probe.result.current.ledger.data).toEqual(balance(500));
  });

  it("retains an exhausted balance and reset date after a failed refetch", async () => {
    mocks.fetchFreeTier.mockResolvedValue(balance(0));
    const probe = renderHook(() => useFreeTierBalance(), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(probe.result.current.data).toEqual(balance(0)));
    mocks.fetchFreeTier.mockRejectedValue(new Error("offline"));
    await act(async () => {
      await probe.result.current.refetch();
    });
    await waitFor(() => expect(probe.result.current.isError).toBe(true));
    expect(probe.result.current.data).toEqual(balance(0));

    mocks.isAdmin = false;
    probe.rerender();
    expect(probe.result.current.data).toBeUndefined();
  });

  describe("render cost", () => {
    afterEach(() => {
      cleanup();
      vi.useRealTimers();
    });

    /** The app's own defaults: the poll cadence and sharing are what is measured. */
    function appClient() {
      return new QueryClient({ defaultOptions: { queries: baseQueryOptions } });
    }

    async function settle() {
      for (let i = 0; i < 4; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
      }
    }

    /**
     * The connect rail reads only the balance, and a poll that found the same one
     * is the common case. It used to re-render the rail twice per poll, because the
     * hook spread the whole query result and so subscribed it to isFetching.
     */
    it("does not re-render a reader for a poll that found the same balance", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let commits = 0;
      function Rail() {
        const { data } = useFreeTierBalance();
        return <span>{data?.remainingUnits ?? "-"}</span>;
      }
      const client = appClient();
      render(
        <QueryClientProvider client={client}>
          <Profiler
            id="rail"
            onRender={() => {
              commits += 1;
            }}
          >
            <Rail />
          </Profiler>
        </QueryClientProvider>,
      );
      await settle();
      const reads = mocks.fetchFreeTier.mock.calls.length;
      commits = 0;

      for (let i = 0; i < 10; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60_000);
        });
        await settle();
      }

      expect(mocks.fetchFreeTier.mock.calls.length).toBe(reads + 10);
      expect(commits).toBe(0);
    });
  });

  /**
   * A poll can be mid-flight when a request reports the allowance exhausted. The
   * report invalidates the balance, which cancels that poll - but its answer was
   * taken before the block, so it must not be what lifts it.
   */
  it("does not let a poll overtaken by a block lift it", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestQueryProvider>{children}</TestQueryProvider>
    );
    const probe = renderHook(
      () => ({ ledger: useFreeTierBalance(), block: useAccountLinkBlock() }),
      { wrapper },
    );
    await waitFor(() =>
      expect(probe.result.current.ledger.data?.remainingUnits).toBe(500),
    );

    let answerStalePoll: (value: ReturnType<typeof balance>) => void = () => {};
    mocks.fetchFreeTier
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answerStalePoll = resolve;
        }),
      )
      .mockResolvedValue(balance(0));
    act(() => {
      void probe.result.current.ledger.refetch();
    });

    act(() => reportFreeTierExhausted());
    await waitFor(() =>
      expect(probe.result.current.ledger.data?.remainingUnits).toBe(0),
    );

    // The overtaken poll lands late, with the positive answer it was sent for.
    await act(async () => {
      answerStalePoll(balance(500));
    });

    expect(probe.result.current.block.exhausted).toBe(true);
  });
});
