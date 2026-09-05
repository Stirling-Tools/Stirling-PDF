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

/** Minimal document stub: no pages, so repopulate is a no-op. */
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
    // A bare command cannot say what it did, so nothing already on the stack
    // can be trusted to describe the page any more.
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
    // The group put the document back, so the earlier edit is still undoable.
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
