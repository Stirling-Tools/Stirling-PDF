import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getLeafStirlingFileStubs: vi.fn(),
  alert: vi.fn(),
  setActiveFileId: vi.fn(),
  restoreWorkbench: vi.fn(),
  workbench: "viewer" as string,
  activeFileId: null as string | null,
}));

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getLeafStirlingFileStubs: mocks.getLeafStirlingFileStubs },
}));
vi.mock("@app/components/toast", () => ({ alert: mocks.alert }));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: mocks.workbench }),
  useNavigationActions: () => ({
    actions: { restoreWorkbench: mocks.restoreWorkbench },
  }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    activeFileId: mocks.activeFileId,
    setActiveFileId: mocks.setActiveFileId,
  }),
}));

import { WorkbenchSessionPersistence } from "@app/components/session/WorkbenchSessionPersistence";
import {
  FileStoreContext,
  FileActionsContext,
} from "@app/contexts/file/contexts";
import type { StirlingFileStub } from "@app/types/fileContext";

const SESSION_KEY = "stirling.workbench.session";

function stub(
  id: string,
  originalFileId: string,
  versionNumber = 1,
): StirlingFileStub {
  return { id, originalFileId, versionNumber, name: `${id}.pdf` } as never;
}

// A minimal stand-in for the FileContext store: mutable state plus subscribers.
function makeStore(open: StirlingFileStub[] = [], selected: string[] = []) {
  const listeners = new Set<() => void>();
  const state = {
    files: {
      ids: open.map((s) => s.id),
      byId: Object.fromEntries(open.map((s) => [s.id, s])),
    },
    ui: { selectedFileIds: selected },
  };
  return {
    state,
    getState: () => state as never,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // reopenView waits on this to know the restored bytes have landed.
    selectors: {
      getFiles: (ids: string[]) => ids.map((id) => ({ id })),
    } as never,
    notify: () => listeners.forEach((listener) => listener()),
  };
}

const actions = {
  addStirlingFileStubs: vi.fn().mockResolvedValue([]),
  setSelectedFiles: vi.fn(),
};

function mount(store: ReturnType<typeof makeStore>) {
  return render(
    <FileStoreContext.Provider value={store as never}>
      <FileActionsContext.Provider
        value={{ actions, dispatch: vi.fn() } as never}
      >
        <WorkbenchSessionPersistence />
      </FileActionsContext.Provider>
    </FileStoreContext.Provider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  actions.addStirlingFileStubs.mockResolvedValue([]);
  mocks.getLeafStirlingFileStubs.mockResolvedValue([]);
  mocks.workbench = "viewer";
  mocks.activeFileId = null;
});
afterEach(() => vi.useRealTimers());

describe("restore", () => {
  it("refills an empty workbench with each file's current leaf, in saved order", async () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        fileIds: ["root-a", "root-b"],
        selectedFileIds: ["root-b"],
      }),
    );
    // root-a forked while the user was away: v3 must win over the stale v1 leaf.
    mocks.getLeafStirlingFileStubs.mockResolvedValue([
      stub("a-v1", "root-a", 1),
      stub("a-v3", "root-a", 3),
      stub("root-b", "root-b", 1),
    ]);

    mount(makeStore());

    await waitFor(() =>
      expect(actions.addStirlingFileStubs).toHaveBeenCalled(),
    );
    const restored = actions.addStirlingFileStubs.mock.calls[0][0];
    expect(restored.map((s: StirlingFileStub) => s.id)).toEqual([
      "a-v3",
      "root-b",
    ]);
    expect(actions.setSelectedFiles).toHaveBeenCalledWith(["root-b"]);
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("does not touch a workbench that already holds files", async () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ fileIds: ["root-a"], selectedFileIds: [] }),
    );
    mount(makeStore([stub("already-open", "already-open")]));

    await act(async () => {});
    expect(actions.addStirlingFileStubs).not.toHaveBeenCalled();
  });

  it("restores what still exists and says how much is gone", async () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ fileIds: ["root-a", "gone"], selectedFileIds: [] }),
    );
    mocks.getLeafStirlingFileStubs.mockResolvedValue([
      stub("root-a", "root-a"),
    ]);

    mount(makeStore());

    await waitFor(() => expect(mocks.alert).toHaveBeenCalled());
    expect(actions.addStirlingFileStubs.mock.calls[0][0]).toHaveLength(1);
    expect(mocks.alert.mock.calls[0][0].alertType).toBe("warning");
  });

  it("does nothing when no session was recorded", async () => {
    mount(makeStore());
    await act(async () => {});
    expect(actions.addStirlingFileStubs).not.toHaveBeenCalled();
    expect(mocks.getLeafStirlingFileStubs).not.toHaveBeenCalled();
  });

  it("reopens the document the user was viewing, at its current version", async () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        fileIds: ["root-a"],
        selectedFileIds: ["root-a"],
        workbench: "fileEditor",
        activeFileId: "root-a",
      }),
    );
    mocks.getLeafStirlingFileStubs.mockResolvedValue([
      stub("a-v2", "root-a", 2),
    ]);

    mount(makeStore());

    await waitFor(() => expect(mocks.setActiveFileId).toHaveBeenCalled());
    expect(mocks.setActiveFileId).toHaveBeenCalledWith("a-v2");
    expect(mocks.restoreWorkbench).toHaveBeenCalledWith("fileEditor");
  });

  it("leaves a URL-owned view to the return path", async () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        fileIds: ["root-a"],
        selectedFileIds: [],
        workbench: "myFiles",
      }),
    );
    mocks.getLeafStirlingFileStubs.mockResolvedValue([
      stub("root-a", "root-a"),
    ]);

    mount(makeStore());

    await waitFor(() =>
      expect(actions.addStirlingFileStubs).toHaveBeenCalled(),
    );
    expect(mocks.restoreWorkbench).not.toHaveBeenCalled();
  });
});

describe("writer", () => {
  it("mirrors the open files and selection as original ids, debounced", async () => {
    vi.useFakeTimers();
    const store = makeStore();
    mount(store);

    store.state.files.ids = ["v2" as never];
    store.state.files.byId = { v2: stub("v2", "root-a", 2) } as never;
    store.state.ui.selectedFileIds = ["v2"];
    act(() => store.notify());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!)).toEqual({
      fileIds: ["root-a"],
      selectedFileIds: ["root-a"],
      workbench: "viewer",
    });
  });

  it("records the current view, so the return lands where the user left", async () => {
    vi.useFakeTimers();
    mocks.workbench = "fileEditor";
    const store = makeStore([stub("f1", "f1")]);
    mount(store);

    act(() => store.notify());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).workbench).toBe(
      "fileEditor",
    );
  });

  it("writes nothing until the restore has settled", () => {
    vi.useFakeTimers();
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ fileIds: ["root-a"], selectedFileIds: [] }),
    );
    // Restore is still awaiting storage, so this mount's empty state is not the truth.
    mocks.getLeafStirlingFileStubs.mockReturnValue(new Promise(() => {}));

    const store = makeStore();
    const { unmount } = mount(store);
    act(() => store.notify());
    unmount();

    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).fileIds).toEqual([
      "root-a",
    ]);
  });

  it("flushes on unmount, so the state at the shell switch survives", () => {
    vi.useFakeTimers();
    const store = makeStore();
    const { unmount } = mount(store);

    store.state.files.ids = ["f1" as never];
    store.state.files.byId = { f1: stub("f1", "f1") } as never;
    act(() => store.notify());
    unmount();

    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).fileIds).toEqual([
      "f1",
    ]);
  });
});
