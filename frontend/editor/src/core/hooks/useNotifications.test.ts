import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { AppNotification } from "@app/services/notifications";

/**
 * The bell is mounted several times over, so what is pinned here is that they share one read: one
 * poll, one set of lookups, one marker, and no timer left running once the last has gone.
 */

const fetchNotifications = vi.fn();

vi.mock("@app/services/notifications", () => ({
  fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
}));

// Counted here so "resolved once per list, not once per row" is observable.
const hasLocalFile = vi.fn((_fileId: string) => Promise.resolve(true));

vi.mock("@app/services/localFilePresence", () => ({
  hasLocalFile: (fileId: string) => hasLocalFile(fileId),
}));

const { useNotifications, refreshNotificationsNow } =
  await import("@app/hooks/useNotifications");

function notification(
  id: string,
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id,
    source: "FAILURE",
    kindId: "UNKNOWN",
    origin: "TOOL",
    ownership: "MINE",
    severity: "ERROR",
    status: "NEW",
    titleKey: `portal.failures.kind.${id}.title`,
    defaultTitle: id,
    detail: "boom",
    fileId: "f-1",
    sourceId: null,
    policyId: null,
    occurrences: 1,
    createdAt: "2026-08-05T00:00:00Z",
    lastSeenAt: "2026-08-05T00:00:00Z",
    actions: [],
    ...overrides,
  };
}

describe("useNotifications", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchNotifications.mockReset().mockResolvedValue([]);
    hasLocalFile.mockClear();
  });

  it("reads the list once however many bells are mounted", async () => {
    fetchNotifications.mockResolvedValue([notification("a")]);

    const first = renderHook(() => useNotifications());
    const second = renderHook(() => useNotifications());

    await waitFor(() =>
      expect(first.result.current.notifications).toHaveLength(1),
    );
    expect(second.result.current.notifications).toHaveLength(1);
    expect(fetchNotifications).toHaveBeenCalledTimes(1);
  });

  it("looks a document up once for the list, not once per row", async () => {
    fetchNotifications.mockResolvedValue([
      notification("a", { fileId: "f-1" }),
      notification("b", { fileId: "f-1" }),
      notification("c", { fileId: "f-2" }),
    ]);

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.notifications).toHaveLength(3));
    expect(hasLocalFile).toHaveBeenCalledTimes(2);
  });

  it("looks up an attended run's document but never an unattended run's", async () => {
    // Asking storage about a source's hash can only miss, and would then be shown as "not on this
    // device" about a document that never was.
    fetchNotifications.mockResolvedValue([
      notification("attended", {
        origin: "POLICY",
        sourceId: null,
        fileId: "editor-file-1",
      }),
      notification("unattended", {
        origin: "POLICY",
        sourceId: "src-s3-invoices",
        fileId: "hashed-identity",
      }),
    ]);

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
    expect(hasLocalFile).toHaveBeenCalledTimes(1);
    expect(hasLocalFile).toHaveBeenCalledWith("editor-file-1");
    expect(
      result.current.documentStateFor(result.current.notifications[0])
        .hasLocalFile,
    ).toBe(true);
    expect(
      result.current.documentStateFor(result.current.notifications[1])
        .hasLocalFile,
    ).toBe(false);
  });

  it("polls on one timer and stops it when the last bell unmounts", async () => {
    vi.useFakeTimers();
    try {
      const first = renderHook(() => useNotifications());
      const second = renderHook(() => useNotifications());
      await act(async () => {});
      expect(fetchNotifications).toHaveBeenCalledTimes(1);

      // Two bells, one tick: a timer per subscriber would read twice here.
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(fetchNotifications).toHaveBeenCalledTimes(2);

      first.unmount();
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(fetchNotifications).toHaveBeenCalledTimes(3);

      second.unmount();
      await act(async () => {
        vi.advanceTimersByTime(120_000);
      });
      expect(fetchNotifications).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks every bell read, not just the one the user opened", async () => {
    fetchNotifications.mockResolvedValue([
      notification("b"),
      notification("a"),
    ]);
    const first = renderHook(() => useNotifications());
    const second = renderHook(() => useNotifications());
    await waitFor(() => expect(first.result.current.unreadCount).toBe(2));
    expect(second.result.current.unreadCount).toBe(2);

    // Async because subscribers are told on a microtask: a bell marks the list read while rendering.
    await act(async () => first.result.current.markAllSeen());

    expect(first.result.current.unreadCount).toBe(0);
    expect(second.result.current.unreadCount).toBe(0);
    expect(
      window.localStorage.getItem("stirling.notifications.lastSeenId"),
    ).toBe("b");
  });

  it("chains one fresh read behind the read in flight rather than joining it", async () => {
    // A refresh exists to observe a write the caller just made. The read in flight may have
    // started before that write, so joining it would report the world without it - and the
    // caller would wait a whole poll interval for news of their own action.
    let release: (listed: AppNotification[]) => void = () => {};
    fetchNotifications.mockImplementationOnce(
      () =>
        new Promise<AppNotification[]>((resolve) => {
          release = resolve;
        }),
    );

    const first = renderHook(() => useNotifications());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);

    // A refresh from a row, twice over, and a second bell mounting - all mid-read. The
    // refreshes share ONE chained read; the mount joins what is already there.
    fetchNotifications.mockResolvedValue([notification("a")]);
    act(() => {
      first.result.current.refresh();
      first.result.current.refresh();
    });
    const second = renderHook(() => useNotifications());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);

    // The stale read lands empty; the chained fresh read is what delivers the row.
    await act(async () => release([]));
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(first.result.current.notifications).toHaveLength(1),
    );
    expect(second.result.current.notifications).toHaveLength(1);
  });

  it("shows a just-reported failure without waiting for the poll", async () => {
    const hook = renderHook(() => useNotifications());
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(1));
    expect(hook.result.current.unreadCount).toBe(0);

    // The failure report chain: row recorded server-side, then the re-read.
    fetchNotifications.mockResolvedValue([notification("a")]);
    act(() => refreshNotificationsNow());

    await waitFor(() => expect(hook.result.current.unreadCount).toBe(1));
  });

  it("still lands the row when the refresh races a poll read already in flight", async () => {
    let releaseStale: (listed: AppNotification[]) => void = () => {};
    fetchNotifications.mockImplementationOnce(
      () =>
        new Promise<AppNotification[]>((resolve) => {
          releaseStale = resolve;
        }),
    );

    const hook = renderHook(() => useNotifications());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);

    // The failure is recorded while a poll's read is still in flight, then its refresh fires.
    // Joining that stale read would miss the row until the next poll interval.
    fetchNotifications.mockResolvedValue([notification("a")]);
    act(() => refreshNotificationsNow());
    await act(async () => releaseStale([]));

    await waitFor(() => expect(hook.result.current.unreadCount).toBe(1));
  });

  it("keeps its own list rather than one left by a bell that has gone", async () => {
    fetchNotifications.mockResolvedValue([notification("a")]);
    const first = renderHook(() => useNotifications());
    await waitFor(() =>
      expect(first.result.current.notifications).toHaveLength(1),
    );
    first.unmount();

    // It must not show the old row while its own read is in flight.
    fetchNotifications.mockResolvedValue([]);
    const second = renderHook(() => useNotifications());

    expect(second.result.current.notifications).toHaveLength(0);
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(2));
    expect(second.result.current.notifications).toHaveLength(0);
  });
});
