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

vi.mock("@app/services/localFilePresence", () => ({
  hasLocalFile: (fileId: string) => hasLocalFile(fileId),
}));

const {
  useNotifications,
  refreshNotificationsNow,
  clearNotificationReadState,
} = await import("@app/hooks/useNotifications");

/** A fetch result. Reviewer by default, so a test says nothing about filtering unless it means to. */
function feed(
  notifications: AppNotification[],
  viewerReviewsTeam = true,
  viewerKey: string | null = VIEWER,
): FetchedNotifications {
  return { notifications, viewerReviewsTeam, viewerKey };
}

const VIEWER = "viewer-a";

function readThroughKeyFor(viewerKey: string): string {
  return `stirling.notifications.readThroughAt.${viewerKey}`;
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
  });

  it("looks up an attended run's document but never an unattended run's", async () => {
    // Only an attended row names a reference this browser could resolve; a source's hash misses.
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

  it("hides a member's unattended row even when its id happens to be stored here", async () => {
    // A source-fed row's fileId is a content hash from another id space. Storage answering for it
    // is a collision, not the document, so the row must go on being filtered as unresolvable.
    hasLocalFile.mockResolvedValue(true);
    fetchNotifications.mockResolvedValue(
      feed(
        [
          notification("unattended", {
            sourceId: "src-s3-invoices",
            fileId: "collides-with-a-local-id",
          }),
        ],
        false,
      ),
    );

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(result.current.notifications).toHaveLength(0);
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
    expect(window.localStorage.getItem(readThroughKeyFor(VIEWER))).toBe(
      String(Date.parse("2026-08-05T00:00:00Z")),
    );
  });

  it("keeps one viewer's read state off another's on a shared browser", async () => {
    // A timestamp is legible to whoever reads it next, so an unscoped marker would leave the
    // incoming user's older failures silently pre-read.
    fetchNotifications.mockResolvedValue(feed([notification("a")]));
    const first = renderHook(() => useNotifications());
    await waitFor(() => expect(first.result.current.unreadCount).toBe(1));
    await act(async () => first.result.current.markAllSeen());
    expect(first.result.current.unreadCount).toBe(0);
    first.unmount();

    // Same browser, same rows, different signed-in viewer.
    fetchNotifications.mockResolvedValue(
      feed([notification("a")], true, "viewer-b"),
    );
    const second = renderHook(() => useNotifications());

    await waitFor(() => expect(second.result.current.unreadCount).toBe(1));
  });

  it("marks nothing when the server names no viewer", async () => {
    // Unscoped would be worse than unsaved: the next viewer here would inherit it.
    fetchNotifications.mockResolvedValue(feed([notification("a")], true, null));
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    await act(async () => result.current.markAllSeen());

    expect(
      Object.keys(window.localStorage).filter((key) =>
        key.startsWith("stirling.notifications.readThroughAt"),
      ),
    ).toEqual([]);
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

    // It leaves the list; a marker holding its id would make the row below read as unread.
    fetchNotifications.mockResolvedValue(feed([notification("old")]));
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.unreadCount).toBe(0);
  });

  it("forgets the marker on sign-out, so the next user's failures are not pre-read", async () => {
    // A time is parseable whoever left it, so an inherited marker would silently mark the
    // incoming user's older rows read - the direction the id-based marker never failed in.
    fetchNotifications.mockResolvedValue(feed([notification("theirs")]));
    const leaving = renderHook(() => useNotifications());
    await waitFor(() => expect(leaving.result.current.unreadCount).toBe(1));
    await act(async () => leaving.result.current.markAllSeen());
    expect(leaving.result.current.unreadCount).toBe(0);

    clearNotificationReadState();
    leaving.unmount();
    expect(window.localStorage.getItem(readThroughKeyFor(VIEWER))).toBeNull();

    // The next user's own row is older than the marker that was just cleared.
    fetchNotifications.mockResolvedValue(
      feed([notification("mine", { lastSeenAt: "2026-08-04T00:00:00Z" })]),
    );
    const arriving = renderHook(() => useNotifications());

    await waitFor(() => expect(arriving.result.current.unreadCount).toBe(1));
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

    // The next bell must not show the old row while its own read is still in flight.
    fetchNotifications.mockResolvedValue(feed([]));
    const second = renderHook(() => useNotifications());

    expect(second.result.current.notifications).toHaveLength(0);
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(2));
    expect(second.result.current.notifications).toHaveLength(0);
  });
});
