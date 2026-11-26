import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { WorkbenchType } from "@editor/types/workbench";
import { useStartupNavigation } from "@editor/hooks/useStartupNavigation";
import {
  clearBulkAddProgress,
  reportBulkAddProgress,
} from "@editor/services/bulkAddProgress";
import { setPendingUnlocks } from "@editor/services/pendingUnlocks";

function setup(workbench: WorkbenchType = "viewer") {
  const apply = vi.fn();
  const view = renderHook(
    ({ count, wb }: { count: number; wb: WorkbenchType }) =>
      useStartupNavigation(count, null, wb, apply),
    { initialProps: { count: 0, wb: workbench } },
  );
  return { apply, ...view };
}

afterEach(() => {
  act(() => clearBulkAddProgress());
  setPendingUnlocks([]);
});

describe("useStartupNavigation", () => {
  it("opens one file from empty in the viewer", () => {
    const { apply, rerender } = setup();
    rerender({ count: 1, wb: "viewer" });
    expect(apply).toHaveBeenCalledWith({
      workbench: "viewer",
      activeFileIndex: 0,
    });
  });

  it("switches to Active Files as several files start uploading, then holds", () => {
    const { apply, rerender } = setup();
    act(() => reportBulkAddProgress(0, 3));
    expect(apply).toHaveBeenCalledExactlyOnceWith({ workbench: "fileEditor" });

    rerender({ count: 1, wb: "fileEditor" });
    rerender({ count: 3, wb: "fileEditor" });
    act(() => clearBulkAddProgress());
    expect(apply).toHaveBeenCalledOnce();
  });

  it("keeps a view the user picks while the upload runs", () => {
    const { apply, rerender } = setup();
    act(() => reportBulkAddProgress(0, 3));
    rerender({ count: 1, wb: "viewer" });
    rerender({ count: 3, wb: "viewer" });
    act(() => clearBulkAddProgress());
    expect(apply).toHaveBeenCalledExactlyOnceWith({ workbench: "fileEditor" });
  });

  it("sends a locked file that arrives after the upload to Active Files", () => {
    const { apply, rerender } = setup();
    act(() => reportBulkAddProgress(0, 2));
    setPendingUnlocks(["locked-a", "locked-b"]);
    act(() => clearBulkAddProgress());
    apply.mockClear();

    rerender({ count: 1, wb: "viewer" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({ workbench: "fileEditor" });
  });

  it("forgets the upload once every prompt is skipped", () => {
    const { apply, rerender } = setup();
    act(() => reportBulkAddProgress(0, 2));
    setPendingUnlocks(["locked-a", "locked-b"]);
    act(() => clearBulkAddProgress());
    setPendingUnlocks([]);
    apply.mockClear();

    rerender({ count: 1, wb: "viewer" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      workbench: "viewer",
      activeFileIndex: 0,
    });
  });
});
