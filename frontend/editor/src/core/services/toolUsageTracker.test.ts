import { describe, it, expect, vi, beforeEach } from "vitest";

import { recordToolUsage } from "@app/api/toolRecommendations";
import {
  getDocumentToolChain,
  getLastCompletedTool,
  notifyToolCompleted,
  resetToolUsageTrackerForTests,
  subscribeToToolCompletions,
} from "@app/services/toolUsageTracker";
import type { FileId } from "@app/types/file";
import type { ToolId } from "@app/types/toolId";

vi.mock("@app/api/toolRecommendations", () => ({
  recordToolUsage: vi.fn().mockResolvedValue(undefined),
}));

const mockRecord = vi.mocked(recordToolUsage);

const fileId = (id: string) => id as FileId;

/** A file the tracker has never seen, carrying only its persisted history. */
const uploaded = (id: string, history: ToolId[] = []) => ({
  id: fileId(id),
  toolHistory: history.map((toolId, index) => ({ toolId, timestamp: index })),
});

/** Runs a tool over `inputs`, producing `outputs`. */
const run = (
  toolId: ToolId,
  inputs: ReturnType<typeof uploaded>[],
  outputs: string[],
) =>
  notifyToolCompleted({ toolId, inputs, outputFileIds: outputs.map(fileId) });

describe("toolUsageTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToolUsageTrackerForTests();
  });

  it("records a fresh upload with no prior chain", () => {
    run("compare", [uploaded("a")], ["a2"]);

    expect(mockRecord).toHaveBeenCalledWith("compare", [[]]);
    expect(getLastCompletedTool()).toBe("compare");
  });

  it("follows the document across operations that replace its id", () => {
    run("compress", [uploaded("a")], ["a2"]);
    run("ocr", [uploaded("a2")], ["a3"]);
    run("merge", [uploaded("a3")], ["a4"]);

    expect(mockRecord).toHaveBeenNthCalledWith(2, "ocr", [["compress"]]);
    expect(mockRecord).toHaveBeenLastCalledWith("merge", [["compress", "ocr"]]);
  });

  it("keeps each document's chain separate", () => {
    run("compress", [uploaded("a")], ["a2"]);
    // A different file: its chain must not inherit the compress above.
    run("ocr", [uploaded("b")], ["b2"]);
    run("watermark", [uploaded("a2")], ["a3"]);

    expect(mockRecord).toHaveBeenNthCalledWith(2, "ocr", [[]]);
    expect(mockRecord).toHaveBeenLastCalledWith("watermark", [["compress"]]);
  });

  it("seeds an unseen file from its persisted tool history", () => {
    run("watermark", [uploaded("a", ["compress", "ocr"])], ["a2"]);

    expect(mockRecord).toHaveBeenCalledWith("watermark", [["compress", "ocr"]]);
  });

  it("reports one chain per distinct input document", () => {
    run("compress", [uploaded("a")], ["a2"]);
    run("ocr", [uploaded("b")], ["b2"]);
    run("merge", [uploaded("a2"), uploaded("b2")], ["m"]);

    expect(mockRecord).toHaveBeenLastCalledWith("merge", [
      ["compress"],
      ["ocr"],
    ]);
  });

  it("collapses inputs that share a chain into one workflow", () => {
    run("compress", [uploaded("a")], ["a2"]);
    run("compress", [uploaded("b")], ["b2"]);
    run("merge", [uploaded("a2"), uploaded("b2")], ["m"]);

    expect(mockRecord).toHaveBeenLastCalledWith("merge", [["compress"]]);
  });

  it("carries the longest input chain onto a merged output", () => {
    run("compress", [uploaded("a")], ["a2"]);
    run("ocr", [uploaded("a2")], ["a3"]);
    run("merge", [uploaded("a3"), uploaded("b")], ["m"]);
    run("addPassword", [uploaded("m")], ["m2"]);

    expect(mockRecord).toHaveBeenLastCalledWith("addPassword", [
      ["compress", "ocr", "merge"],
    ]);
  });

  it("gives every output of a split the input's chain", () => {
    run("compress", [uploaded("a")], ["a2"]);
    run("split", [uploaded("a2")], ["p1", "p2"]);

    expect(getDocumentToolChain(uploaded("p1"))).toEqual(["compress", "split"]);
    expect(getDocumentToolChain(uploaded("p2"))).toEqual(["compress", "split"]);
  });

  it("prefers the tracked chain over a stale persisted history", () => {
    run("compress", [uploaded("a")], ["a2"]);

    // The stub still carries the pre-operation history; the tracker is ahead.
    expect(getDocumentToolChain(uploaded("a2", ["ocr"]))).toEqual(["compress"]);
  });

  it("never rejects when recording fails", async () => {
    mockRecord.mockRejectedValueOnce(new Error("offline"));

    expect(() => run("compare", [uploaded("a")], ["a2"])).not.toThrow();
    await Promise.resolve();
  });

  it("notifies subscribers on every completion and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToToolCompletions(listener);

    run("compare", [uploaded("a")], ["a2"]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    run("ocr", [uploaded("a2")], ["a3"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
