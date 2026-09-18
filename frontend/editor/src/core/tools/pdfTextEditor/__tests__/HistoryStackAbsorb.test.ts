import { describe, expect, it, vi } from "vitest";
import { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { HistoryStack } from "@app/tools/pdfTextEditor/store/HistoryStack";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

// A stand-in for EditTextCommand's absorb: same-key follow-ups fold into a NEW
// command object that carries the latest result.
function absorbingCmd(
  key: string,
  text: string,
  log: string[],
): Command & { resultText: string } {
  const cmd = {
    type: "absorbing",
    resultText: text,
    apply: () => log.push(`apply:${text}`),
    revert: () => log.push(`revert:${text}`),
    coalesceKey: () => key,
    absorb(next: Command): Command | null {
      const n = next as unknown as { resultText?: string };
      if (typeof n.resultText !== "string") return null;
      return absorbingCmd(key, n.resultText, log);
    },
  };
  return cmd;
}

function plainCmd(key: string): Command {
  return {
    type: "plain",
    apply: vi.fn(),
    revert: vi.fn(),
    coalesceKey: () => key,
  } as unknown as Command;
}

function makeDoc(): EditorDocument {
  return {
    pageCount: 0,
    loadedPages: () => [],
    dispose: () => {},
  } as unknown as EditorDocument;
}

describe("HistoryStack absorb coalescing", () => {
  it("folds same-key follow-ups into one new command object", () => {
    const history = new HistoryStack();
    const doc = makeDoc();
    const log: string[] = [];
    history.execute(absorbingCmd("k", "a", log), doc);
    history.execute(absorbingCmd("k", "ab", log), doc);
    expect(history.size().undo).toBe(1);
    expect(
      (history.peekUndo() as unknown as { resultText: string }).resultText,
    ).toBe("ab");
    // Revert runs once, from the merged command.
    history.undo(doc);
    expect(log.filter((l) => l.startsWith("revert:"))).toEqual(["revert:ab"]);
  });

  it("produces a new reference so saved-position dirty tracking still fires", async () => {
    const store = new EditorStore();
    await store.setDocument(makeDoc());
    const log: string[] = [];
    store.dispatch(absorbingCmd("k", "a", log));
    store.markSaved();
    expect(store.getState().dirty).toBe(false);
    store.dispatch(absorbingCmd("k", "ab", log));
    // The merged command is a different object from the saved one.
    expect(store.getState().dirty).toBe(true);
  });

  it("falls back to a CompositeCommand when the command cannot absorb", () => {
    const history = new HistoryStack();
    const doc = makeDoc();
    history.execute(plainCmd("k"), doc);
    history.execute(plainCmd("k"), doc);
    expect(history.size().undo).toBe(1);
    expect(history.peekUndo()?.type).toBe("composite");
  });

  it("does not merge when the follow-up's key differs", () => {
    const history = new HistoryStack();
    const doc = makeDoc();
    const log: string[] = [];
    history.execute(absorbingCmd("k", "a", log), doc);
    history.execute(absorbingCmd("other", "b", log), doc);
    expect(history.size().undo).toBe(2);
  });
});
