import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOpenedFiles: vi.fn<() => Promise<string[]>>(),
  listen: vi.fn<() => Promise<() => void>>(),
  beginLoading: vi.fn(),
  endLoading: vi.fn(),
}));

vi.mock("@app/services/fileOpenService", () => ({
  fileOpenService: { getOpenedFiles: mocks.getOpenedFiles },
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: "main", listen: mocks.listen }),
}));
vi.mock("@app/services/launchFiles", () => ({
  trackLaunchFilePop: <T,>(pop: Promise<T>) => pop,
  beginLoadingLaunchFiles: mocks.beginLoading,
  endLoadingLaunchFiles: mocks.endLoading,
}));

import { useOpenedFile } from "@app/hooks/useOpenedFile";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOpenedFiles.mockResolvedValue([]);
  mocks.listen.mockResolvedValue(vi.fn());
});

describe("launch-file consumer lifetime", () => {
  it("does not register files returned after the consumer unmounts", async () => {
    const pop = deferred<string[]>();
    mocks.getOpenedFiles.mockReturnValue(pop.promise);
    const { unmount } = renderHook(useOpenedFile);
    await waitFor(() => expect(mocks.getOpenedFiles).toHaveBeenCalledOnce());

    unmount();
    await act(async () => pop.resolve(["C:/late.pdf"]));

    expect(mocks.beginLoading).not.toHaveBeenCalled();
    expect(mocks.endLoading).not.toHaveBeenCalled();
  });

  it("releases an unconsumed batch when the consumer unmounts", async () => {
    mocks.getOpenedFiles.mockResolvedValue(["C:/pending.pdf"]);
    const { result, unmount } = renderHook(useOpenedFile);
    await waitFor(() =>
      expect(result.current.openedFilePaths).toEqual(["C:/pending.pdf"]),
    );

    unmount();

    expect(mocks.beginLoading).toHaveBeenCalledOnce();
    expect(mocks.endLoading).toHaveBeenCalledOnce();
  });

  it("leaves a consumed batch tracked until the loader finishes", async () => {
    mocks.getOpenedFiles.mockResolvedValue(["C:/loading.pdf"]);
    const { result, unmount } = renderHook(useOpenedFile);
    await waitFor(() =>
      expect(result.current.openedFilePaths).toEqual(["C:/loading.pdf"]),
    );

    act(() =>
      expect(result.current.consumeOpenedFilePaths()).toEqual([
        "C:/loading.pdf",
      ]),
    );
    unmount();

    expect(mocks.beginLoading).toHaveBeenCalledOnce();
    expect(mocks.endLoading).not.toHaveBeenCalled();
  });

  it("releases a cleared batch only once", async () => {
    mocks.getOpenedFiles.mockResolvedValue(["C:/cleared.pdf"]);
    const { result, unmount } = renderHook(useOpenedFile);
    await waitFor(() =>
      expect(result.current.openedFilePaths).toEqual(["C:/cleared.pdf"]),
    );

    act(() => result.current.clearOpenedFilePaths());
    unmount();

    expect(mocks.endLoading).toHaveBeenCalledOnce();
  });

  it("removes an event listener that finishes registering after unmount", async () => {
    const listener = deferred<() => void>();
    const unlisten = vi.fn();
    mocks.listen.mockReturnValue(listener.promise);
    const { unmount } = renderHook(useOpenedFile);

    unmount();
    await act(async () => listener.resolve(unlisten));

    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("keeps launch files available through StrictMode effect replay", async () => {
    mocks.getOpenedFiles
      .mockResolvedValueOnce(["C:/launch.pdf"])
      .mockResolvedValue([]);
    const { result, unmount } = renderHook(useOpenedFile, {
      wrapper: StrictMode,
    });

    await waitFor(() =>
      expect(result.current.openedFilePaths).toEqual(["C:/launch.pdf"]),
    );
    expect(mocks.beginLoading).toHaveBeenCalledOnce();
    unmount();
    expect(mocks.endLoading).toHaveBeenCalledOnce();
  });
});
