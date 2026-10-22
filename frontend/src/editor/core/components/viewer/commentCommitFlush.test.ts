import { describe, expect, it, vi } from "vitest";
import {
  flushCommentCommits,
  registerCommentCommitFlush,
} from "@app/components/viewer/commentCommitFlush";

describe("comment commit flush", () => {
  it("runs the registered sidebar flush until it unregisters", () => {
    const flush = vi.fn();
    const unregister = registerCommentCommitFlush(flush);

    flushCommentCommits();
    expect(flush).toHaveBeenCalledTimes(1);

    unregister();
    flushCommentCommits();
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
