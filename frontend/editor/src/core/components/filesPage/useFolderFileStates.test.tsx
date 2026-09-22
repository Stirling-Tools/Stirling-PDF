import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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
  vi.useFakeTimers({ shouldAdvanceTime: true });
  renderHook(() => useFolderFileStates("folder", true), {
    wrapper: queryWrapper(),
  });
  await waitFor(() => expect(listFiles).toHaveBeenCalledOnce());

  setTabHidden(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(listFiles).toHaveBeenCalledOnce();

  setTabHidden(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
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
