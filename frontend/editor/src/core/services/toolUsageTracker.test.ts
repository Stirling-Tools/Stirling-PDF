import { describe, it, expect, vi, beforeEach } from "vitest";

import { recordToolUsage } from "@app/api/toolRecommendations";
import {
  getLastCompletedTool,
  notifyToolCompleted,
  resetToolUsageTrackerForTests,
  subscribeToToolCompletions,
} from "@app/services/toolUsageTracker";

vi.mock("@app/api/toolRecommendations", () => ({
  recordToolUsage: vi.fn().mockResolvedValue(undefined),
}));

const mockRecord = vi.mocked(recordToolUsage);

describe("toolUsageTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToolUsageTrackerForTests();
  });

  it("records the first completion without a predecessor", () => {
    notifyToolCompleted("compare");

    expect(mockRecord).toHaveBeenCalledWith("compare", undefined);
    expect(getLastCompletedTool()).toBe("compare");
  });

  it("records the previous tool as the transition edge", () => {
    notifyToolCompleted("compare");
    notifyToolCompleted("ocr");

    expect(mockRecord).toHaveBeenLastCalledWith("ocr", "compare");
  });

  it("tracks the latest tool as the context for the next completion", () => {
    notifyToolCompleted("compare");
    notifyToolCompleted("ocr");
    notifyToolCompleted("merge");

    expect(mockRecord).toHaveBeenLastCalledWith("merge", "ocr");
    expect(getLastCompletedTool()).toBe("merge");
  });

  it("never rejects when recording fails", async () => {
    mockRecord.mockRejectedValueOnce(new Error("offline"));

    expect(() => notifyToolCompleted("compare")).not.toThrow();
    await Promise.resolve();
  });

  it("notifies subscribers on every completion and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToToolCompletions(listener);

    notifyToolCompleted("compare");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    notifyToolCompleted("ocr");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
