import { describe, expect, it } from "vitest";
import {
  HistoryStack,
  HistoryStepError,
} from "@app/tools/pdfTextEditor/store/HistoryStack";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

const doc = {} as EditorDocument;

function cmd(opts: { failRevert?: boolean; failApply?: boolean }): Command {
  return {
    type: "test",
    apply: () => {
      if (opts.failApply) throw new Error("apply blew up");
    },
    revert: () => {
      if (opts.failRevert) throw new Error("revert blew up");
    },
  } as unknown as Command;
}

describe("HistoryStack failure handling", () => {
  it("surfaces a failed revert instead of leaking the raw error", () => {
    const h = new HistoryStack();
    h.execute(cmd({ failRevert: true }), doc);
    expect(() => h.undo(doc)).toThrow(HistoryStepError);
  });

  it("does not put a failed command back on the redo stack", () => {
    const h = new HistoryStack();
    h.execute(cmd({ failRevert: true }), doc);
    try {
      h.undo(doc);
    } catch {
      /* expected */
    }
    // Neither stack may claim the command: the document state is unknown.
    expect(h.size()).toEqual({ undo: 0, redo: 0 });
  });

  it("surfaces a failed redo the same way", () => {
    const h = new HistoryStack();
    const c = cmd({});
    h.execute(c, doc);
    h.undo(doc);
    // Make the redo throw only now, after the command is on the redo stack.
    (c as unknown as { apply: () => void }).apply = () => {
      throw new Error("apply blew up");
    };
    expect(() => h.redo(doc)).toThrow(HistoryStepError);
    expect(h.size()).toEqual({ undo: 0, redo: 0 });
  });

  it("still reverts normally when nothing throws", () => {
    const h = new HistoryStack();
    h.execute(cmd({}), doc);
    expect(h.undo(doc)).not.toBeNull();
    expect(h.size()).toEqual({ undo: 0, redo: 1 });
  });
});
