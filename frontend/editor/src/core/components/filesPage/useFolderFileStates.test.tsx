import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { Profiler, type ReactElement } from "react";
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@app/query/queryClient";
import { useFolderFileStates } from "@app/components/filesPage/useFolderFileStates";
import type { MountedFileState } from "@app/hooks/useProcessingFolders";
import {
  resetTabVisibility,
  setTabHidden,
} from "@app/tests/utils/tabVisibility";

const { listFiles } = vi.hoisted(() => ({
  listFiles: vi.fn<() => Promise<MountedFileState[]>>(),
}));

vi.mock("@app/hooks/useProcessingFolders", () => ({
  useProcessingFolders: () => ({ listFiles }),
}));

function queryWrapper() {
  const client = createAppQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  listFiles
    .mockReset()
    .mockResolvedValue([
      { name: "report.pdf", state: "done", hasOriginal: true },
    ]);
});

afterEach(() => {
  cleanup();
  resetTabVisibility();
  vi.useRealTimers();
});

test("library and picker share a read and immediately reflect a restore", async () => {
  const { result } = renderHook(
    () => ({
      library: useFolderFileStates("folder", true),
      picker: useFolderFileStates("folder", true),
    }),
    { wrapper: queryWrapper() },
  );
  await waitFor(() =>
    expect(result.current.picker.fileStates.get("report.pdf")).toBe("done"),
  );
  expect(listFiles).toHaveBeenCalledOnce();
  expect(result.current.library.revertables.has("report.pdf")).toBe(true);

  act(() =>
    result.current.library.patchProcessingFile("report.pdf", {
      state: "waiting",
      hasOriginal: false,
    }),
  );

  await waitFor(() =>
    expect(result.current.picker.fileStates.get("report.pdf")).toBe("waiting"),
  );
  expect(result.current.library.fileStates.get("report.pdf")).toBe("waiting");
  expect(result.current.picker.revertables.has("report.pdf")).toBe(false);
  expect(listFiles).toHaveBeenCalledOnce();
});

test("polling pauses while hidden and resumes when visible", async () => {
  vi.useFakeTimers();
  renderHook(() => useFolderFileStates("folder", true), {
    wrapper: queryWrapper(),
  });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(listFiles).toHaveBeenCalledOnce();

  await act(async () => {
    setTabHidden(true);
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(listFiles).toHaveBeenCalledOnce();

  await act(async () => {
    setTabHidden(false);
    await vi.advanceTimersByTimeAsync(3001);
  });
  expect(listFiles).toHaveBeenCalledTimes(2);
});

test("a late reply cannot replace the newly opened folder's states", async () => {
  let finishPrevious!: (files: MountedFileState[]) => void;
  listFiles.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishPrevious = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    (recordId) => useFolderFileStates(recordId, true),
    { initialProps: "previous", wrapper: queryWrapper() },
  );
  await waitFor(() => expect(listFiles).toHaveBeenCalledOnce());
  rerender("current");
  await waitFor(() =>
    expect(result.current.fileStates.get("report.pdf")).toBe("done"),
  );

  await act(async () => {
    finishPrevious([{ name: "old.pdf", state: "failed" }]);
  });
  expect(result.current.fileStates.get("report.pdf")).toBe("done");
  expect(result.current.fileStates.has("old.pdf")).toBe(false);
});

function show() {
  return renderHook(({ id, enabled }) => useFolderFileStates(id, enabled), {
    initialProps: { id: "folder-one", enabled: true },
    wrapper: queryWrapper(),
  });
}

describe("processing file locks", () => {
  beforeEach(() => vi.useFakeTimers());
  it("locks unlisted, queued and processing files until a terminal state arrives", async () => {
    listFiles.mockResolvedValue([
      { name: "queued.pdf", state: "waiting" },
      { name: "active.pdf", state: "processing" },
      { name: "done.pdf", state: "done" },
      { name: "failed.pdf", state: "failed" },
    ]);
    const { result } = show();
    expect(result.current.processingLockedFor("new.pdf")).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(result.current.processingLockedFor("queued.pdf")).toBe(true);
    expect(result.current.processingLockedFor("active.pdf")).toBe(true);
    expect(result.current.processingLockedFor("done.pdf")).toBe(false);
    expect(result.current.processingLockedFor("failed.pdf")).toBe(false);

    listFiles.mockResolvedValue([{ name: "queued.pdf", state: "done" }]);
    await act(async () => vi.advanceTimersByTimeAsync(3001));
    expect(result.current.processingLockedFor("queued.pdf")).toBe(false);
  });

  it("releases locks after three failed polls and restores them when polling recovers", async () => {
    listFiles.mockRejectedValue(new Error("Server unavailable"));
    const { result } = show();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(result.current.processingLockedFor("queued.pdf")).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(3001));
    expect(result.current.processingLockedFor("queued.pdf")).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(3001));
    expect(listFiles).toHaveBeenCalledTimes(3);
    expect(result.current.processingStatesUnavailable).toBe(true);
    expect(result.current.processingLockedFor("queued.pdf")).toBe(false);

    listFiles.mockResolvedValue([{ name: "queued.pdf", state: "waiting" }]);
    await act(async () => vi.advanceTimersByTimeAsync(3001));
    expect(result.current.processingStatesUnavailable).toBe(false);
    expect(result.current.processingLockedFor("queued.pdf")).toBe(true);
  });

  it("does not carry failed polls into another folder or lock an inactive view", async () => {
    listFiles.mockRejectedValue(new Error("Server unavailable"));
    const { result, rerender } = show();
    await act(async () => vi.advanceTimersByTimeAsync(6003));
    expect(result.current.processingStatesUnavailable).toBe(true);

    rerender({ id: "folder-two", enabled: true });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(result.current.processingStatesUnavailable).toBe(false);
    expect(result.current.processingLockedFor("new.pdf")).toBe(true);

    rerender({ id: "folder-two", enabled: false });
    expect(result.current.processingLockedFor("new.pdf")).toBe(false);
  });
});

/**
 * The files page renders a row per file and a card per folder, so anything this
 * hook re-renders for is paid many times over. A poll that found nothing new is
 * the common case and has to cost nothing.
 */
test("a poll that changed nothing does not re-render its readers", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const Wrapper = queryWrapper();
  let commits = 0;

  function Probe() {
    const { fileStates } = useFolderFileStates("rec-quiet", true);
    return <span>{fileStates.size}</span>;
  }

  const settle = async () => {
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }
  };

  render(
    (
      <Wrapper>
        <Profiler
          id="files"
          onRender={() => {
            commits += 1;
          }}
        >
          <Probe />
        </Profiler>
      </Wrapper>
    ) as ReactElement,
  );
  await settle();
  const reads = listFiles.mock.calls.length;
  commits = 0;

  // Ten ticks, the same answer every time.
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await settle();
  }

  expect(listFiles.mock.calls.length).toBeGreaterThan(reads);
  expect(commits).toBe(0);
});
