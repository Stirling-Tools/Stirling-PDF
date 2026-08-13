import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { AppNotification } from "@app/services/notifications";

/**
 * The bell is mounted several times over (floated over an empty workbench, inside the workbench bar,
 * again in the portal shell) and all of them show the same thing, so what is pinned here is that
 * they share one read of it: one poll, one set of document lookups, one read marker, and no timer
 * left running once the last of them has gone.
 */

const fetchNotifications = vi.fn();

vi.mock("@app/services/notifications", () => ({
  fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
}));

// The document lookups read IndexedDB, which jsdom has none of. Counted here so that "resolved once
// per list, not once per row" is observable.
const hasLocalFile = vi.fn((_fileId: string) => Promise.resolve(true));
const loadRetryPayload = vi.fn((_fileId: string) => Promise.resolve(null));

vi.mock("@app/services/notificationRetry", () => ({
  hasLocalFile: (fileId: string) => hasLocalFile(fileId),
  loadRetryPayload: (fileId: string) => loadRetryPayload(fileId),
}));

const { useNotifications } = await import("@app/hooks/useNotifications");

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
    loadRetryPayload.mockClear();
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
    expect(loadRetryPayload).toHaveBeenCalledTimes(2);
  });

  it("looks up an attended run's document but never an unattended run's", async () => {
    // Both rows name a document, but only the attended one names a reference this browser could
    // resolve. Asking storage about a source's hash can only miss, which would then be shown as "not
    // on this device" about a document that was never on one.
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

    // Async, because the store tells its subscribers on a microtask: a bell marks the list read
    // from inside its own state updater, so it cannot re-render its neighbours from there.
    await act(async () => first.result.current.markAllSeen());

    expect(first.result.current.unreadCount).toBe(0);
    expect(second.result.current.unreadCount).toBe(0);
    expect(
      window.localStorage.getItem("stirling.notifications.lastSeenId"),
    ).toBe("b");
  });

  it("joins the read in flight rather than starting a second one", async () => {
    let release: (listed: AppNotification[]) => void = () => {};
    fetchNotifications.mockImplementation(
      () =>
        new Promise<AppNotification[]>((resolve) => {
          release = resolve;
        }),
    );

    const first = renderHook(() => useNotifications());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);

    // A refresh from a row, twice over, and a second bell mounting - all mid-read.
    act(() => {
      first.result.current.refresh();
      first.result.current.refresh();
    });
    const second = renderHook(() => useNotifications());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);

    await act(async () => release([notification("a")]));
    expect(first.result.current.notifications).toHaveLength(1);
    expect(second.result.current.notifications).toHaveLength(1);

    // Once it has landed, the next refresh does go and read again.
    fetchNotifications.mockResolvedValue([]);
    await act(async () => second.result.current.refresh());
    expect(fetchNotifications).toHaveBeenCalledTimes(2);
  });

  it("keeps its own list rather than one left by a bell that has gone", async () => {
    fetchNotifications.mockResolvedValue([notification("a")]);
    const first = renderHook(() => useNotifications());
    await waitFor(() =>
      expect(first.result.current.notifications).toHaveLength(1),
    );
    first.unmount();

    // Nothing to report by the time the next bell appears: it must not show the old row while its
    // own read is in flight.
    fetchNotifications.mockResolvedValue([]);
    const second = renderHook(() => useNotifications());

    expect(second.result.current.notifications).toHaveLength(0);
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(2));
    expect(second.result.current.notifications).toHaveLength(0);
  });
});
