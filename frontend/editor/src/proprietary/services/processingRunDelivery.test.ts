import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deliverSweepResults,
  currentRunIds,
} from "./processingRunDelivery";
import {
  fetchProcessingFolderRuns,
  fetchRunOutputFile,
  type ProcessingFolderRun,
} from "./processingFolderApi";

vi.mock("./processingFolderApi", () => ({
  fetchProcessingFolderRuns: vi.fn(),
  fetchRunOutputFile: vi.fn(),
}));

const runsFeed = vi.mocked(fetchProcessingFolderRuns);
const outputFile = vi.mocked(fetchRunOutputFile);

const run = (
  runId: string,
  status: string,
  outputs: { fileId: string; fileName: string }[] = [],
): ProcessingFolderRun =>
  ({ runId, status, fileName: runId + ".pdf", outputs }) as ProcessingFolderRun;

describe("deliverSweepResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outputFile.mockResolvedValue(new File(["x"], "out.pdf"));
  });

  it("delivers only the included runs and stops at their expected count", async () => {
    // The feed retains an earlier sweep's terminal run; without scoping it would be
    // re-delivered and satisfy the expected count in place of the new run.
    runsFeed.mockResolvedValue([
      run("old-1", "COMPLETED", [{ fileId: "f0", fileName: "old.pdf" }]),
      run("new-1", "COMPLETED", [{ fileId: "f1", fileName: "new.pdf" }]),
    ]);
    const addFiles = vi.fn().mockResolvedValue(undefined);

    const progress = await deliverSweepResults("p1", 1, addFiles, {
      includeRunIds: new Set(["new-1"]),
    });

    expect(progress.processed).toBe(1);
    expect(addFiles).toHaveBeenCalledTimes(1);
    expect(outputFile).toHaveBeenCalledTimes(1);
    expect(outputFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f1" }),
    );
  });

  it("ignores a baseline run instead of re-delivering it or stopping early", async () => {
    // Poll 1: only the baseline's old run. Poll 2+: the new run appears and settles.
    // Unscoped, poll 1 is already "all terminal" and the loop would stand down
    // before the new run ever registers.
    const old = run("old-1", "COMPLETED", [{ fileId: "f0", fileName: "o.pdf" }]);
    runsFeed
      .mockResolvedValueOnce([old])
      .mockResolvedValue([
        old,
        run("new-1", "COMPLETED", [{ fileId: "f1", fileName: "n.pdf" }]),
      ]);
    const addFiles = vi.fn().mockResolvedValue(undefined);

    const progress = await deliverSweepResults("p1", null, addFiles, {
      excludeRunIds: new Set(["old-1"]),
    });

    expect(progress.processed).toBe(1);
    expect(outputFile).toHaveBeenCalledTimes(1);
    expect(outputFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f1" }),
    );
  }, 15000);
});

describe("currentRunIds", () => {
  it("captures the feed's ids and swallows a failed read", async () => {
    runsFeed.mockResolvedValueOnce([run("a", "RUNNING"), run("b", "COMPLETED")]);
    expect(await currentRunIds("p1")).toEqual(new Set(["a", "b"]));

    runsFeed.mockRejectedValueOnce(new Error("down"));
    expect(await currentRunIds("p1")).toEqual(new Set());
  });
});
