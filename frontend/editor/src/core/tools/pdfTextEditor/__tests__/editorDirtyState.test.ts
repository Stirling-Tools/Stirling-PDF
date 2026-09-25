import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

function makeCmd(type = "test"): Command {
  return { type, apply: vi.fn(), revert: vi.fn() } as unknown as Command;
}

function makeKeyedCmd(key: string): Command {
  return {
    type: "keyed",
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

async function makeStore(): Promise<EditorStore> {
  const store = new EditorStore();
  await store.setDocument(makeDoc());
  return store;
}

describe("EditorStore dirty tracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a freshly loaded document is clean", async () => {
    const store = await makeStore();
    expect(store.getState().dirty).toBe(false);
  });

  it("an edit dirties the document and saving clears it", async () => {
    const store = await makeStore();
    store.dispatch(makeCmd("a"));
    expect(store.getState().dirty).toBe(true);
    store.markSaved();
    expect(store.getState().dirty).toBe(false);
  });

  it("undoing past the saved point reports dirty", async () => {
    const store = await makeStore();
    store.dispatch(makeCmd("a"));
    store.markSaved();
    store.undo();
    expect(store.getState().dirty).toBe(true);
  });

  it("a new edit after save then undo reports dirty", async () => {
    const store = await makeStore();
    store.dispatch(makeCmd("a"));
    store.markSaved();
    store.undo();
    store.dispatch(makeCmd("b"));
    expect(store.getState().dirty).toBe(true);
  });

  it("undoing back to the saved point reports clean", async () => {
    const store = await makeStore();
    store.dispatch(makeCmd("a"));
    store.markSaved();
    store.dispatch(makeCmd("b"));
    expect(store.getState().dirty).toBe(true);
    store.undo();
    expect(store.getState().dirty).toBe(false);
  });

  it("redoing away from the saved point reports dirty", async () => {
    const store = await makeStore();
    store.dispatch(makeCmd("a"));
    store.markSaved();
    store.dispatch(makeCmd("b"));
    store.undo();
    store.redo();
    expect(store.getState().dirty).toBe(true);
  });

  it("a coalescable edit after saving cannot rejoin the saved step", async () => {
    const store = await makeStore();
    store.dispatch(makeKeyedCmd("run:1"));
    store.dispatch(makeKeyedCmd("run:1"));
    expect(store.history.size().undo).toBe(1);
    store.markSaved();
    store.dispatch(makeKeyedCmd("run:1"));
    expect(store.history.size().undo).toBe(2);
    expect(store.getState().dirty).toBe(true);
  });

  it("undoing a post-save coalesced burst returns to the saved step", async () => {
    const store = await makeStore();
    store.dispatch(makeKeyedCmd("run:1"));
    store.markSaved();
    store.dispatch(makeKeyedCmd("run:1"));
    store.dispatch(makeKeyedCmd("run:1"));
    expect(store.getState().dirty).toBe(true);
    store.undo();
    expect(store.getState().dirty).toBe(false);
  });

  it("resetAll returns to clean only when the base was the saved state", async () => {
    const store = await makeStore();
    store.dispatch(makeCmd("a"));
    store.resetAll();
    expect(store.getState().dirty).toBe(false);

    store.dispatch(makeCmd("b"));
    store.markSaved();
    store.resetAll();
    expect(store.getState().dirty).toBe(true);
  });
});
