import { describe, expect, it, vi } from "vitest";
import { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { CompositeCommand } from "@app/tools/pdfTextEditor/commands/CompositeCommand";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

function makeCmd(overrides: Partial<Command> = {}): Command {
  return {
    type: "test",
    apply: vi.fn(),
    revert: vi.fn(),
    ...overrides,
  } as unknown as Command;
}

function makeDoc(): EditorDocument {
  return {
    pageCount: 0,
    loadedPages: () => [],
    dispose: () => {},
  } as unknown as EditorDocument;
}

async function makeStore(): Promise<EditorStore> {
  const store = new EditorStore();
  await store.setDocument(makeDoc());
  return store;
}

describe("EditorStore recovery from a failed apply", () => {
  it("does not throw out of dispatch when a command's apply fails", async () => {
    const store = await makeStore();
    expect(() =>
      store.dispatch(
        makeCmd({
          apply: () => {
            throw new Error("pdfium said no");
          },
        }),
      ),
    ).not.toThrow();
  });

  it("surfaces the underlying failure, not the history wrapper", async () => {
    const store = await makeStore();
    store.dispatch(
      makeCmd({
        apply: () => {
          throw new Error("pdfium said no");
        },
      }),
    );
    expect(store.getState().error).toBe("pdfium said no");
  });

  it("throws the history away when the document may be half-changed", async () => {
    const store = await makeStore();
    store.dispatch(makeCmd());
    expect(store.history.canUndo).toBe(true);
    store.dispatch(
      makeCmd({
        apply: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(store.history.canUndo).toBe(false);
    expect(store.getState().dirty).toBe(true);
  });

  it("keeps the history when a composite rolled itself back", async () => {
    const store = await makeStore();
    store.dispatch(makeCmd());
    const before = store.history.peekUndo();
    store.dispatch(
      new CompositeCommand([
        makeCmd(),
        makeCmd({
          apply: () => {
            throw new Error("second child failed");
          },
        }),
      ]),
    );
    expect(store.history.peekUndo()).toBe(before);
    expect(store.getState().error).toBe("second child failed");
  });

  it("a failed edit does not mark a clean document dirty when it rolled back", async () => {
    const store = await makeStore();
    store.dispatch(
      new CompositeCommand([
        makeCmd(),
        makeCmd({
          apply: () => {
            throw new Error("nope");
          },
        }),
      ]),
    );
    expect(store.getState().dirty).toBe(false);
  });
});

describe("EditorStore recovery from a failed undo/redo", () => {
  function rollingBackComposite(): CompositeCommand {
    return new CompositeCommand([
      makeCmd(),
      makeCmd({
        revert: () => {
          throw new Error("revert child failed");
        },
      }),
    ]);
  }

  it("keeps the step undoable when its revert rolled itself back", async () => {
    const store = await makeStore();
    const cmd = rollingBackComposite();
    store.dispatch(cmd);
    store.undo();
    expect(store.history.canUndo).toBe(true);
    expect(store.history.peekUndo()).toBe(cmd);
    expect(store.history.canRedo).toBe(false);
  });

  it("still reports the document dirty after a rolled-back undo", async () => {
    const store = await makeStore();
    store.dispatch(rollingBackComposite());
    store.undo();
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().error).toBe("revert child failed");
  });

  it("keeps the step redoable when its re-apply rolled itself back", async () => {
    const store = await makeStore();
    const first = makeCmd();
    let applies = 0;
    const cmd = new CompositeCommand([
      first,
      makeCmd({
        apply: () => {
          applies += 1;
          if (applies > 1) throw new Error("re-apply child failed");
        },
      }),
    ]);
    store.dispatch(cmd);
    store.undo();
    expect(store.history.canRedo).toBe(true);

    store.redo();

    expect(store.history.size()).toEqual({ undo: 0, redo: 1 });
    expect(store.history.canRedo).toBe(true);
    expect(store.history.canUndo).toBe(false);
    expect(store.getState().error).toBe("re-apply child failed");
    expect(first.revert).toHaveBeenCalledTimes(2); // the undo, then the rollback
  });

  it("throws the history away when a failed undo did not roll back", async () => {
    const store = await makeStore();
    store.dispatch(
      makeCmd({
        revert: () => {
          throw new Error("half reverted");
        },
      }),
    );
    store.undo();
    expect(store.history.canUndo).toBe(false);
    expect(store.history.canRedo).toBe(false);
    expect(store.getState().dirty).toBe(true);
  });
});
