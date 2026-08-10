import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import {
  FileStoreContext,
  type FileStateStore,
} from "@app/contexts/file/contexts";
import { useFileIndex } from "@app/contexts/file/fileHooks";
import type {
  FileContextSelectors,
  FileContextState,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/**
 * useFileIndex replaced a render-time `selectors.getFiles()` read in
 * ViewerContext, which never re-subscribed and so survived a file-list change
 * that moved the active file. These tests drive a hand-built store (the real one
 * needs IndexedDB to populate its File map) and lock the two properties the fix
 * depends on: the index tracks the RESOLVED file list, and the consumer
 * re-renders only when the index actually moves.
 */

function makeStore(ids: string[], resolved: string[]) {
  let state: FileContextState = {
    files: { ids: ids as FileId[], byId: {} },
  } as FileContextState;
  let resolvedIds = new Set(resolved);
  const listeners = new Set<() => void>();

  // Mirrors createFileSelectors.getFiles: maps ids through the in-memory File
  // map and DROPS the ones whose bytes haven't landed yet.
  const selectors = {
    getFiles: (requested?: FileId[]) =>
      (requested ?? state.files.ids)
        .filter((id) => resolvedIds.has(id as string))
        .map((id) => ({ fileId: id })),
  } as unknown as FileContextSelectors;

  const store: FileStateStore = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectors,
  };

  const update = (nextIds: string[], nextResolved: string[] = nextIds) => {
    act(() => {
      state = {
        files: { ids: nextIds as FileId[], byId: {} },
      } as FileContextState;
      resolvedIds = new Set(nextResolved);
      listeners.forEach((listener) => listener());
    });
  };

  return { store, update };
}

function setup(ids: string[], resolved: string[], fileId: string | null) {
  const { store, update } = makeStore(ids, resolved);
  let renders = 0;
  let index = -1;

  function Probe() {
    index = useFileIndex(fileId);
    renders++;
    return null;
  }

  render(
    <FileStoreContext.Provider value={store}>
      <Probe />
    </FileStoreContext.Provider>,
  );

  return { update, get: () => index, renderCount: () => renders };
}

describe("useFileIndex", () => {
  it("reports the active file's position in the resolved list", () => {
    const { get } = setup(["a", "b", "c"], ["a", "b", "c"], "c");
    expect(get()).toBe(2);
  });

  it("skips ids whose bytes haven't hydrated, matching what consumers index into", () => {
    // "a" has no File yet, so getFiles() yields [b, c] — "c" sits at 1, not 2.
    const { get } = setup(["a", "b", "c"], ["b", "c"], "c");
    expect(get()).toBe(1);
  });

  it("updates when the list reorders under a stable active file", () => {
    // The regression this fixes: activeFileId never changed, so the old
    // useMemo kept returning the pre-reorder index.
    const { get, update } = setup(["a", "b", "c"], ["a", "b", "c"], "c");
    expect(get()).toBe(2);
    update(["c", "a", "b"]);
    expect(get()).toBe(0);
  });

  it("updates when a file ahead of the active one is removed", () => {
    const { get, update } = setup(["a", "b", "c"], ["a", "b", "c"], "c");
    update(["b", "c"]);
    expect(get()).toBe(1);
  });

  it("falls back to 0 when the active file leaves the list", () => {
    const { get, update } = setup(["a", "b"], ["a", "b"], "b");
    update(["a"]);
    expect(get()).toBe(0);
  });

  it("returns 0 with no active file", () => {
    const { get } = setup(["a", "b"], ["a", "b"], null);
    expect(get()).toBe(0);
  });

  it("does not re-render when a store change leaves the index alone", () => {
    // Selecting a NUMBER is the point: appending after the active file, or any
    // unrelated stub churn, must not re-render the consumer.
    const { get, update, renderCount } = setup(["a", "b"], ["a", "b"], "a");
    const before = renderCount();
    update(["a", "b", "c"]);
    expect(get()).toBe(0);
    expect(renderCount()).toBe(before);
  });
});
