import { describe, expect, it, vi } from "vitest";
import { HistoryStack } from "@app/tools/pdfTextEditor/v2/store/HistoryStack";
import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

function makeCmd(type = "test") {
  const apply = vi.fn();
  const revert = vi.fn();
  const cmd: Command = { type, apply, revert };
  return { cmd, apply, revert };
}

const fakeDoc = {} as unknown as EditorDocument;

describe("HistoryStack", () => {
  it("starts empty and reports neither undo nor redo", () => {
    const h = new HistoryStack();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.size()).toEqual({ undo: 0, redo: 0 });
  });

  it("execute applies and pushes onto the undo stack", () => {
    const h = new HistoryStack();
    const { cmd, apply } = makeCmd();
    h.execute(cmd, fakeDoc);
    expect(apply).toHaveBeenCalledOnce();
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("undo reverts the most recent command and moves it to redo", () => {
    const h = new HistoryStack();
    const { cmd, revert } = makeCmd();
    h.execute(cmd, fakeDoc);
    const popped = h.undo(fakeDoc);
    expect(popped).toBe(cmd);
    expect(revert).toHaveBeenCalledOnce();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  it("redo re-applies and shifts back to undo", () => {
    const h = new HistoryStack();
    const { cmd, apply } = makeCmd();
    h.execute(cmd, fakeDoc);
    h.undo(fakeDoc);
    const popped = h.redo(fakeDoc);
    expect(popped).toBe(cmd);
    // apply was called once on execute and once on redo.
    expect(apply).toHaveBeenCalledTimes(2);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("a new execute after undo discards the redo stack", () => {
    const h = new HistoryStack();
    const a = makeCmd("a");
    const b = makeCmd("b");
    h.execute(a.cmd, fakeDoc);
    h.undo(fakeDoc);
    expect(h.canRedo).toBe(true);
    h.execute(b.cmd, fakeDoc);
    expect(h.canRedo).toBe(false);
  });

  it("undo on an empty stack is a no-op and returns null", () => {
    const h = new HistoryStack();
    expect(h.undo(fakeDoc)).toBeNull();
  });

  it("clear empties both stacks", () => {
    const h = new HistoryStack();
    h.execute(makeCmd("a").cmd, fakeDoc);
    h.execute(makeCmd("b").cmd, fakeDoc);
    h.clear();
    expect(h.size()).toEqual({ undo: 0, redo: 0 });
  });

  it("enforces the configured limit by dropping the oldest entry", () => {
    const h = new HistoryStack(3);
    h.execute(makeCmd("a").cmd, fakeDoc);
    h.execute(makeCmd("b").cmd, fakeDoc);
    h.execute(makeCmd("c").cmd, fakeDoc);
    h.execute(makeCmd("d").cmd, fakeDoc);
    expect(h.size().undo).toBe(3);
  });
});
