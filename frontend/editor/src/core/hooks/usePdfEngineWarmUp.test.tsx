import React from "react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  FileStoreContext,
  type FileStateStore,
} from "@app/contexts/file/contexts";
import type { FileContextState } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const mockStartEagerWasmCompilation = vi.fn();

vi.mock("@app/services/wasmPrecompiler", () => ({
  startEagerWasmCompilation: () => mockStartEagerWasmCompilation(),
}));

interface MutableMockStore extends FileStateStore {
  setFiles: (ids: FileId[]) => void;
}

function createMockStore(initialFileIds: FileId[] = []): MutableMockStore {
  let state = {
    files: {
      ids: initialFileIds,
      byId: {},
    },
  } as unknown as FileContextState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setFiles: (ids: FileId[]) => {
      state = {
        ...state,
        files: { ...state.files, ids },
      };
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectors: {} as FileStateStore["selectors"],
  };
}

describe("usePdfEngineWarmUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("warms up immediately when files already exist in store", async () => {
    const store = createMockStore(["file-1" as FileId]);
    const { usePdfEngineWarmUp } =
      await import("@app/hooks/usePdfEngineWarmUp");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FileStoreContext.Provider value={store}>
        {children}
      </FileStoreContext.Provider>
    );

    renderHook(() => usePdfEngineWarmUp(), { wrapper });

    expect(mockStartEagerWasmCompilation).toHaveBeenCalledTimes(1);
  });

  test("waits the fallback delay before warming up when no files exist", async () => {
    const store = createMockStore([]);
    const { usePdfEngineWarmUp } =
      await import("@app/hooks/usePdfEngineWarmUp");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FileStoreContext.Provider value={store}>
        {children}
      </FileStoreContext.Provider>
    );

    renderHook(() => usePdfEngineWarmUp(), { wrapper });

    expect(mockStartEagerWasmCompilation).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(9999);
    });
    expect(mockStartEagerWasmCompilation).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(mockStartEagerWasmCompilation).toHaveBeenCalledTimes(1);
  });

  test("triggers early on pointerdown", async () => {
    const store = createMockStore([]);
    const { usePdfEngineWarmUp } =
      await import("@app/hooks/usePdfEngineWarmUp");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FileStoreContext.Provider value={store}>
        {children}
      </FileStoreContext.Provider>
    );

    renderHook(() => usePdfEngineWarmUp(), { wrapper });

    expect(mockStartEagerWasmCompilation).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });

    expect(mockStartEagerWasmCompilation).toHaveBeenCalledTimes(1);

    // The fallback timer is cancelled, so the later deadline does not warm twice.
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(mockStartEagerWasmCompilation).toHaveBeenCalledTimes(1);
  });

  test("triggers early when file is added to store", async () => {
    const store = createMockStore([]);
    const { usePdfEngineWarmUp } =
      await import("@app/hooks/usePdfEngineWarmUp");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FileStoreContext.Provider value={store}>
        {children}
      </FileStoreContext.Provider>
    );

    renderHook(() => usePdfEngineWarmUp(), { wrapper });

    expect(mockStartEagerWasmCompilation).not.toHaveBeenCalled();

    act(() => {
      store.setFiles(["new-file" as FileId]);
    });

    expect(mockStartEagerWasmCompilation).toHaveBeenCalledTimes(1);
  });
});
