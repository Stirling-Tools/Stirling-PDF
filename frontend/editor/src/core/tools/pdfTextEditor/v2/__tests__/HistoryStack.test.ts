import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// Coalescing is what decides how much one Ctrl+Z reverts, and until now it was
// only ever exercised through the browser suite.
describe("HistoryStack coalescing", () => {
  /** A command that groups with others sharing `key`. */
  function keyed(key: string | null, opts: { ignoresWindow?: boolean } = {}) {
    const { cmd, apply, revert } = makeCmd("keyed");
    const full: Command = {
      ...cmd,
      apply,
      revert,
      coalesceKey: () => key,
      ...(opts.ignoresWindow ? { coalesceIgnoresTimeWindow: () => true } : {}),
    };
    return full;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups same-key commands inside the 600ms window into one undo step", () => {
    const h = new HistoryStack();
    h.execute(keyed("run:1"), fakeDoc);
    vi.advanceTimersByTime(300);
    h.execute(keyed("run:1"), fakeDoc);
    expect(h.size().undo).toBe(1);
  });

  it("starts a new undo step once the window has elapsed", () => {
    const h = new HistoryStack();
    h.execute(keyed("run:1"), fakeDoc);
    vi.advanceTimersByTime(601);
    h.execute(keyed("run:1"), fakeDoc);
    expect(h.size().undo).toBe(2);
  });

  it("never groups commands with different keys", () => {
    const h = new HistoryStack();
    h.execute(keyed("run:1"), fakeDoc);
    h.execute(keyed("run:2"), fakeDoc);
    expect(h.size().undo).toBe(2);
  });

  it("never groups commands that opt out of coalescing", () => {
    const h = new HistoryStack();
    h.execute(keyed(null), fakeDoc);
    h.execute(keyed(null), fakeDoc);
    expect(h.size().undo).toBe(2);
  });

  it("coalesceIgnoresTimeWindow groups however long the gap was", () => {
    const h = new HistoryStack();
    h.execute(keyed("run:1"), fakeDoc);
    vi.advanceTimersByTime(60_000);
    h.execute(keyed("run:1", { ignoresWindow: true }), fakeDoc);
    expect(h.size().undo).toBe(1);
  });

  it("hands the hook the previous command, unwrapped from its group", () => {
    const h = new HistoryStack();
    const first = keyed("run:1");
    const second = keyed("run:1");
    h.execute(first, fakeDoc);
    h.execute(second, fakeDoc);
    expect(h.size().undo).toBe(1); // first+second are now a CompositeCommand

    const seen: Array<Command | null> = [];
    const third: Command = {
      ...keyed("run:1"),
      coalesceIgnoresTimeWindow: (previous: Command | null) => {
        seen.push(previous);
        return true;
      },
    };
    vi.advanceTimersByTime(60_000);
    h.execute(third, fakeDoc);
    // The group's most recent child, not the CompositeCommand wrapper.
    expect(seen).toEqual([second]);
  });

  it("passes null to the hook when the undo stack is empty", () => {
    const h = new HistoryStack();
    const seen: Array<Command | null> = [];
    h.execute(
      {
        ...keyed("run:1"),
        coalesceIgnoresTimeWindow: (previous: Command | null) => {
          seen.push(previous);
          return false;
        },
      },
      fakeDoc,
    );
    expect(seen).toEqual([null]);
  });

  it("does not charge a command's own apply() time to the idle window", () => {
    const h = new HistoryStack();
    h.execute(keyed("run:1"), fakeDoc);
    vi.advanceTimersByTime(300);
    // A slow command: 500ms of PDFium/render work inside apply().
    const slow: Command = {
      type: "slow",
      apply: () => vi.advanceTimersByTime(500),
      revert: () => {},
      coalesceKey: () => "run:1",
    };
    h.execute(slow, fakeDoc);
    expect(h.size().undo).toBe(1);
  });

  it("undo ends the burst so the next edit cannot rejoin the step below", () => {
    const h = new HistoryStack();
    h.execute(keyed("run:1"), fakeDoc);
    vi.advanceTimersByTime(700);
    h.execute(keyed("run:1"), fakeDoc);
    expect(h.size().undo).toBe(2);
    h.undo(fakeDoc);
    expect(h.size().undo).toBe(1);
    // Immediately after the undo, so inside the window - but the burst was
    // ended, so this must not merge into the step that is still on the stack.
    h.execute(keyed("run:1"), fakeDoc);
    expect(h.size().undo).toBe(2);
  });

  it("breakCoalescing splits an otherwise groupable pair", () => {
    const h = new HistoryStack();
    h.execute(keyed("run:1"), fakeDoc);
    h.breakCoalescing();
    h.execute(keyed("run:1"), fakeDoc);
    expect(h.size().undo).toBe(2);
  });
});
