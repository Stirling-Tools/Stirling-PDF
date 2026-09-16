import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * The hook holds module-level state, so each case imports its own copy.
 */
async function loadHook() {
  vi.resetModules();
  return (await import("@app/components/filesPage/processingFolderCounts"))
    .useProcessingFolderCounts;
}

describe("useProcessingFolderCounts", () => {
  it("reads once for a mounted folder, however many times it renders", async () => {
    const useProcessingFolderCounts = await loadHook();
    const listFiles = vi.fn(async () => [{ state: "done" }]);

    function Row() {
      const counts = useProcessingFolderCounts("folder-1", listFiles);
      return <span>{counts ? Object.keys(counts).join() : "none"}</span>;
    }

    render(<Row />);
    // Each settled read notifies subscribers, so a renewed subscription would
    // read again on the render that follows: several turns is enough to tell a
    // single read from a loop.
    for (let turn = 0; turn < 10; turn += 1) {
      await act(async () => {});
    }

    expect(listFiles).toHaveBeenCalledTimes(1);
  });
});
