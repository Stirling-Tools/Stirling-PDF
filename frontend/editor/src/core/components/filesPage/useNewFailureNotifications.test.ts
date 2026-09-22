import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshNotificationsNow = vi.fn();

vi.mock("@app/hooks/useNotifications", () => ({
  refreshNotificationsNow: () => refreshNotificationsNow(),
}));

const { useNewFailureNotifications } =
  await import("@app/components/filesPage/useNewFailureNotifications");

type States = ReadonlyMap<string, "done" | "processing" | "failed" | "waiting">;

const states = (entries: Record<string, string>): States =>
  new Map(Object.entries(entries)) as States;

/** One folder's poll, re-rendered with whatever it read this tick. */
function watch(folder: string | undefined, initial: States) {
  return renderHook(
    ({ folderId, seen }: { folderId: string | undefined; seen: States }) =>
      useNewFailureNotifications(folderId, seen),
    { initialProps: { folderId: folder, seen: initial } },
  );
}

describe("useNewFailureNotifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refreshNotificationsNow.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says nothing about failures a folder already held when it opened", () => {
    // Those rows reached the bell when they happened. Reporting them on open would read the list
    // again every time someone walked into the folder.
    watch("folder-1", states({ "a.pdf": "failed", "b.pdf": "failed" }));

    vi.advanceTimersByTime(5000);

    expect(refreshNotificationsNow).not.toHaveBeenCalled();
  });

  it("reads once when a document turns failed", () => {
    const { rerender } = watch("folder-1", states({ "a.pdf": "processing" }));

    rerender({ folderId: "folder-1", seen: states({ "a.pdf": "failed" }) });
    vi.advanceTimersByTime(1000);

    expect(refreshNotificationsNow).toHaveBeenCalledTimes(1);
  });

  it("reads once for a whole sweep's worth of failures, not once each", () => {
    // The ask: four hundred documents failing together is one read, not four hundred.
    const { rerender } = watch("folder-1", states({}));

    for (let i = 0; i < 400; i++) {
      const failed: Record<string, string> = {};
      for (let seen = 0; seen <= i; seen++)
        failed[`file-${seen}.pdf`] = "failed";
      rerender({ folderId: "folder-1", seen: states(failed) });
    }
    vi.advanceTimersByTime(1000);

    expect(refreshNotificationsNow).toHaveBeenCalledTimes(1);
  });

  it("does not read again while the states are merely re-read unchanged", () => {
    // The folder polls every few seconds and rebuilds the map each time, so a hook that watched
    // the contents rather than the change would read forever.
    const { rerender } = watch("folder-1", states({ "a.pdf": "processing" }));

    rerender({ folderId: "folder-1", seen: states({ "a.pdf": "failed" }) });
    vi.advanceTimersByTime(1000);
    for (let tick = 0; tick < 5; tick++) {
      rerender({ folderId: "folder-1", seen: states({ "a.pdf": "failed" }) });
      vi.advanceTimersByTime(3000);
    }

    expect(refreshNotificationsNow).toHaveBeenCalledTimes(1);
  });

  it("reads again for a failure that arrives after the last one settled", () => {
    const { rerender } = watch("folder-1", states({ "a.pdf": "processing" }));

    rerender({ folderId: "folder-1", seen: states({ "a.pdf": "failed" }) });
    vi.advanceTimersByTime(1000);
    rerender({
      folderId: "folder-1",
      seen: states({ "a.pdf": "failed", "b.pdf": "failed" }),
    });
    vi.advanceTimersByTime(1000);

    expect(refreshNotificationsNow).toHaveBeenCalledTimes(2);
  });

  it("re-baselines on another folder rather than reporting its existing failures", () => {
    const { rerender } = watch("folder-1", states({ "a.pdf": "done" }));

    rerender({ folderId: "folder-2", seen: states({ "a.pdf": "failed" }) });
    vi.advanceTimersByTime(5000);

    expect(refreshNotificationsNow).not.toHaveBeenCalled();
  });

  it("counts a document that failed again after being retried", () => {
    // Retry puts it back to processing; failing a second time is a new incident to hear about.
    const { rerender } = watch("folder-1", states({ "a.pdf": "failed" }));

    rerender({ folderId: "folder-1", seen: states({ "a.pdf": "processing" }) });
    rerender({ folderId: "folder-1", seen: states({ "a.pdf": "failed" }) });
    vi.advanceTimersByTime(1000);

    expect(refreshNotificationsNow).toHaveBeenCalledTimes(1);
  });

  it("drops a gathered read when the folder is closed before it lands", () => {
    const { rerender, unmount } = watch(
      "folder-1",
      states({ "a.pdf": "processing" }),
    );

    rerender({ folderId: "folder-1", seen: states({ "a.pdf": "failed" }) });
    unmount();
    vi.advanceTimersByTime(5000);

    expect(refreshNotificationsNow).not.toHaveBeenCalled();
  });
});
