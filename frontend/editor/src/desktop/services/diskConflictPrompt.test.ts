import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FileId } from "@app/types/file";
import { expectConsole } from "@app/tests/failOnConsole";

import {
  requestDiskConflictChoice,
  resolveDiskConflict,
  cancelDiskConflict,
  subscribeDiskConflicts,
  __resetDiskConflicts,
} from "@app/services/diskConflictPrompt";

const req = (id: string, onUseDisk = vi.fn()) => ({
  fileId: id as FileId,
  name: `${id}.pdf`,
  onUseDisk,
});

beforeEach(() => __resetDiskConflicts());

describe("diskConflictPrompt", () => {
  it("hands the queue to a new subscriber immediately", () => {
    requestDiskConflictChoice(req("a"));
    const seen = vi.fn();
    subscribeDiskConflicts(seen);
    expect(seen).toHaveBeenCalledWith([
      expect.objectContaining({ name: "a.pdf" }),
    ]);
  });

  it("keeps conflicts in order so the modal answers one at a time", () => {
    const seen = vi.fn();
    subscribeDiskConflicts(seen);
    requestDiskConflictChoice(req("a"));
    requestDiskConflictChoice(req("b"));
    expect(seen).toHaveBeenLastCalledWith([
      expect.objectContaining({ fileId: "a" }),
      expect.objectContaining({ fileId: "b" }),
    ]);
  });

  it("ignores a repeat for the same file", () => {
    // A re-check of the same divergence must not stack modals behind each other.
    requestDiskConflictChoice(req("a"));
    requestDiskConflictChoice(req("a"));
    const seen = vi.fn();
    subscribeDiskConflicts(seen);
    expect(seen.mock.calls[0][0]).toHaveLength(1);
  });

  it("runs the swap only when the disk version is chosen", () => {
    const onUseDisk = vi.fn();
    requestDiskConflictChoice(req("a", onUseDisk));
    resolveDiskConflict("disk");
    expect(onUseDisk).toHaveBeenCalledTimes(1);
  });

  it("keeps the local version untouched when mine is chosen", () => {
    const onUseDisk = vi.fn();
    requestDiskConflictChoice(req("a", onUseDisk));
    resolveDiskConflict("mine");
    expect(onUseDisk).not.toHaveBeenCalled();
  });

  it("advances to the next conflict once one is answered", () => {
    const seen = vi.fn();
    subscribeDiskConflicts(seen);
    requestDiskConflictChoice(req("a"));
    requestDiskConflictChoice(req("b"));
    resolveDiskConflict("mine");
    expect(seen).toHaveBeenLastCalledWith([
      expect.objectContaining({ fileId: "b" }),
    ]);
  });

  it("survives a swap that throws, so the queue cannot wedge", () => {
    // The failure must be logged, not swallowed.
    expectConsole.error("[diskConflictPrompt] use-disk failed");
    const boom = vi.fn(() => {
      throw new Error("swap failed");
    });
    const seen = vi.fn();
    subscribeDiskConflicts(seen);
    requestDiskConflictChoice(req("a", boom));
    requestDiskConflictChoice(req("b"));
    expect(() => resolveDiskConflict("disk")).not.toThrow();
    expect(seen).toHaveBeenLastCalledWith([
      expect.objectContaining({ fileId: "b" }),
    ]);
  });

  it("drops a queued conflict for a file that went away", () => {
    const seen = vi.fn();
    subscribeDiskConflicts(seen);
    requestDiskConflictChoice(req("a"));
    requestDiskConflictChoice(req("b"));
    cancelDiskConflict("a" as FileId);
    expect(seen).toHaveBeenLastCalledWith([
      expect.objectContaining({ fileId: "b" }),
    ]);
  });

  it("does nothing when answering an empty queue", () => {
    expect(() => resolveDiskConflict("disk")).not.toThrow();
  });

  it("stops notifying after unsubscribe", () => {
    const seen = vi.fn();
    const off = subscribeDiskConflicts(seen);
    off();
    seen.mockClear();
    requestDiskConflictChoice(req("a"));
    expect(seen).not.toHaveBeenCalled();
  });
});
