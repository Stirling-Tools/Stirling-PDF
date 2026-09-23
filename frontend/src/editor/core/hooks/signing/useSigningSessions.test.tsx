import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { baseQueryOptions } from "@app/query/queryClient";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import { useSigningSessions } from "@app/hooks/signing/useSigningSessions";
import { fetchSigningSessions } from "@app/api/signing";
import { alert } from "@app/components/toast";
import { expectConsole } from "@app/tests/failOnConsole";

vi.mock("@app/api/signing", () => ({ fetchSigningSessions: vi.fn() }));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
  }),
}));

const mockFetch = vi.mocked(fetchSigningSessions);
const mockAlert = vi.mocked(alert);

const EMPTY = { signRequests: [], mySessions: [] };

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  // Bubbles, as the real event does: query-core listens for it on window.
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}

describe("useSigningSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(EMPTY);
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("dedupes concurrent observers of the same key", async () => {
    const { result } = renderHook(
      () => ({
        badge: useSigningSessions({
          enabled: true,
          autoRefreshInterval: 60000,
        }),
        launcher: useSigningSessions({ enabled: true }),
        controller: useSigningSessions({
          enabled: true,
          autoRefreshInterval: 15000,
        }),
      }),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(result.current.badge.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not fetch while disabled", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      () => useSigningSessions({ enabled: false, autoRefreshInterval: 15000 }),
      { wrapper: TestQueryProvider },
    );

    expect(mockFetch).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.signRequests).toEqual([]);
  });

  it("starts fetching when enabled flips on", async () => {
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useSigningSessions({ enabled: on }),
      { wrapper: TestQueryProvider, initialProps: { on: false } },
    );

    expect(mockFetch).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("polls on the interval", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      () => useSigningSessions({ enabled: true, autoRefreshInterval: 15000 }),
      { wrapper: TestQueryProvider },
    );

    expect(result.current.loading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not raise the spinner while a background poll is in flight", async () => {
    // Real timers, a held-open poll, and every render recorded. Asserting on
    // result.current alone is not enough: waitFor returns as soon as the fetch
    // count moves, before React has re-rendered, so a spinner that did flip on
    // would be missed.
    const seen: boolean[] = [];
    const { result } = renderHook(
      () => {
        const state = useSigningSessions({
          enabled: true,
          autoRefreshInterval: 50,
        });
        seen.push(state.loading);
        return state;
      },
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Marked before the poll: waitFor flushes renders, so recording after it
    // would skip straight past the in-flight one.
    const fromPollStart = seen.length;

    let release: (v: unknown) => void = () => {};
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    // Give React room to render the in-flight state, if it produces one.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    // Mid-poll: this is what the old `silent` flag bought.
    expect(seen.slice(fromPollStart)).not.toContain(true);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      release(EMPTY);
    });
  });

  it("shows the spinner for a user-initiated refresh, not a background poll", async () => {
    // Real timers: the in-flight window has to be observable, which is exactly
    // what a fake-timer act() hides.
    const { result } = renderHook(() => useSigningSessions({ enabled: true }), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let release: (v: unknown) => void = () => {};
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );

    let done: Promise<void>;
    act(() => {
      done = result.current.refetch();
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      release(EMPTY);
      await done;
    });
    expect(result.current.loading).toBe(false);
  });

  it("toasts a first-load failure", async () => {
    expectConsole.error(/Failed to fetch signing data/);
    mockFetch.mockRejectedValue(new Error("down"));

    const { result } = renderHook(() => useSigningSessions({ enabled: true }), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  it("stays silent when a background poll fails after a success", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValueOnce(EMPTY);

    const { result } = renderHook(
      () => useSigningSessions({ enabled: true, autoRefreshInterval: 15000 }),
      { wrapper: TestQueryProvider },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loading).toBe(false);
    expect(mockAlert).not.toHaveBeenCalled();

    mockFetch.mockRejectedValue(new Error("flaky"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it("toasts an explicit refetch failure even with data on screen", async () => {
    expectConsole.error(/Failed to fetch signing data/);
    const { result } = renderHook(() => useSigningSessions({ enabled: true }), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockAlert).not.toHaveBeenCalled();

    mockFetch.mockRejectedValue(new Error("nope"));
    await act(async () => {
      await result.current.refetch();
    });

    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  it("stops polling while the tab is hidden", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      () => useSigningSessions({ enabled: true, autoRefreshInterval: 15000 }),
      { wrapper: TestQueryProvider },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loading).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    // Four intervals elapsed with the tab in the background.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
  });

  it("refetches on becoming visible rather than waiting out the interval", async () => {
    vi.useFakeTimers();
    // The app client turns focus refetching off globally; TestQueryProvider
    // does not, and would pass this on the library default alone.
    const client = new QueryClient({
      defaultOptions: {
        queries: { ...baseQueryOptions, retry: false, gcTime: Infinity },
      },
    });
    const { result } = renderHook(
      () => useSigningSessions({ enabled: true, autoRefreshInterval: 15000 }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loading).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("stops polling once unmounted", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(
      () => useSigningSessions({ enabled: true, autoRefreshInterval: 15000 }),
      { wrapper: TestQueryProvider },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
