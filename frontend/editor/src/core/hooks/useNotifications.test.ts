import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  AppNotification,
  FetchedNotifications,
} from "@app/services/notifications";

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
const loadRetryPayload = vi.fn((_fileId: string) => Promise.resolve(null));

vi.mock("@app/services/notificationRetry", () => ({
  hasLocalFile: (fileId: string) => hasLocalFile(fileId),
  loadRetryPayload: (fileId: string) => loadRetryPayload(fileId),
}));

const { useNotifications, refreshNotificationsNow } =
  await import("@app/hooks/useNotifications");

/** A fetch result. Reviewer by default, so a test says nothing about filtering unless it means to. */
function feed(
  notifications: AppNotification[],
  viewerReviewsTeam = true,
): FetchedNotifications {
  return { notifications, viewerReviewsTeam };
}

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
    fetchNotifications.mockReset().mockResolvedValue(feed([]));
    hasLocalFile.mockReset().mockResolvedValue(true);
    loadRetryPayload.mockReset().mockResolvedValue(null);
  });

  it("reads the list once however many bells are mounted", async () => {
    fetchNotifications.mockResolvedValue(feed([notification("a")]));

    const first = renderHook(() => useNotifications());
    const second = renderHook(() => useNotifications());

    await waitFor(() =>
      expect(first.result.current.notifications).toHaveLength(1),
    );
    expect(second.result.current.notifications).toHaveLength(1);
    expect(fetchNotifications).toHaveBeenCalledTimes(1);
  });

  it("looks a document up once for the list, not once per row", async () => {
    fetchNotifications.mockResolvedValue(
      feed([
        notification("a", { fileId: "f-1" }),
        notification("b", { fileId: "f-1" }),
        notification("c", { fileId: "f-2" }),
      ]),
    );

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.notifications).toHaveLength(3));
    expect(hasLocalFile).toHaveBeenCalledTimes(2);
    expect(loadRetryPayload).toHaveBeenCalledTimes(2);
  });

  it("looks up an attended run's document but never an unattended run's", async () => {
    // Only the attended row names a reference this browser could resolve; a source's hash can only
    // miss, and would then read as "not on this device" about a document that never was.
    fetchNotifications.mockResolvedValue(
      feed([
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
      ]),
    );

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

  it("hides a member's row whose document is not in this browser, keeps the one that is", async () => {
    hasLocalFile.mockImplementation((id: string) =>
      Promise.resolve(id === "here"),
    );
    fetchNotifications.mockResolvedValue(
      feed(
        [
          notification("gone", { fileId: "gone" }),
          notification("kept", { fileId: "here" }),
        ],
        false,
      ),
    );

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].id).toBe("kept");
    // The hidden row is not news either: it must not light the badge.
    expect(result.current.unreadCount).toBe(1);
  });

  it("shows a reviewer both rows, document here or not", async () => {
    // A reviewer keeps a row for a file they cannot open: it is how they see a policy needs fixing.
    hasLocalFile.mockImplementation((id: string) =>
      Promise.resolve(id === "here"),
    );
    fetchNotifications.mockResolvedValue(
      feed(
        [
          notification("gone", { fileId: "gone" }),
          notification("kept", { fileId: "here" }),
        ],
        true,
      ),
    );

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
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
    fetchNotifications.mockResolvedValue(
      feed([notification("b"), notification("a")]),
    );
    const first = renderHook(() => useNotifications());
    const second = renderHook(() => useNotifications());
    await waitFor(() => expect(first.result.current.unreadCount).toBe(2));
    expect(second.result.current.unreadCount).toBe(2);

    // Async because subscribers are told on a microtask: a bell marks the list read while rendering.
    await act(async () => first.result.current.markAllSeen());

    expect(first.result.current.unreadCount).toBe(0);
    expect(second.result.current.unreadCount).toBe(0);
    expect(
      window.localStorage.getItem("stirling.notifications.readThroughAt"),
    ).toBe(String(Date.parse("2026-08-05T00:00:00Z")));
  });

  it("keeps earlier rows read once the row that was newest has gone", async () => {
    fetchNotifications.mockResolvedValue(
      feed([
        notification("new", { lastSeenAt: "2026-08-05T01:00:00Z" }),
        notification("old"),
      ]),
    );
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await act(async () => result.current.markAllSeen());
    expect(result.current.unreadCount).toBe(0);

    // Resolved, so it leaves the list. A marker holding its id would have nothing left to measure
    // from, and the row below it would read as unread again.
    fetchNotifications.mockResolvedValue(feed([notification("old")]));
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.unreadCount).toBe(0);
  });

  it("chains one fresh read behind the read in flight rather than joining it", async () => {
    // A refresh exists to observe a write the caller just made. The read in flight may have
    // started before that write, so joining it would report the world without it - and the
    // caller would wait a whole poll interval for news of their own action.
    let release: (fetched: FetchedNotifications) => void = () => {};
    fetchNotifications.mockImplementationOnce(
      () =>
        new Promise<FetchedNotifications>((resolve) => {
          release = resolve;
        }),
    );

    const first = renderHook(() => useNotifications());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);

    // A refresh from a row, twice over, and a second bell mounting - all mid-read. The
    // refreshes share ONE chained read; the mount joins what is already there.
    fetchNotifications.mockResolvedValue(feed([notification("a")]));
    act(() => {
      first.result.current.refresh();
      first.result.current.refresh();
    });
    const second = renderHook(() => useNotifications());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);

    // The stale read lands empty; the chained fresh read is what delivers the row.
    await act(async () => release(feed([])));
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
    fetchNotifications.mockResolvedValue(feed([notification("a")]));
    act(() => refreshNotificationsNow());

    await waitFor(() => expect(hook.result.current.unreadCount).toBe(1));
  });

  it("still lands the row when the refresh races a poll read already in flight", async () => {
    let releaseStale: (fetched: FetchedNotifications) => void = () => {};
    fetchNotifications.mockImplementationOnce(
      () =>
        new Promise<FetchedNotifications>((resolve) => {
          releaseStale = resolve;
        }),
    );

    const hook = renderHook(() => useNotifications());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);

    // The failure is recorded while a poll's read is still in flight, then its refresh fires.
    // Joining that stale read would miss the row until the next poll interval.
    fetchNotifications.mockResolvedValue(feed([notification("a")]));
    act(() => refreshNotificationsNow());
    await act(async () => releaseStale(feed([])));

    await waitFor(() => expect(hook.result.current.unreadCount).toBe(1));
  });

  it("keeps its own list rather than one left by a bell that has gone", async () => {
    fetchNotifications.mockResolvedValue(feed([notification("a")]));
    const first = renderHook(() => useNotifications());
    await waitFor(() =>
      expect(first.result.current.notifications).toHaveLength(1),
    );
    first.unmount();

    // Nothing to report by the time the next bell appears: it must not show the old row while its
    // own read is in flight.
    fetchNotifications.mockResolvedValue(feed([]));
    const second = renderHook(() => useNotifications());

    expect(second.result.current.notifications).toHaveLength(0);
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(2));
    expect(second.result.current.notifications).toHaveLength(0);
  });
});
