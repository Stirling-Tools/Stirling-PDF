import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileId } from "@app/types/file";
import { useLazyThumbnail } from "@app/hooks/useLazyThumbnail";

const mocks = vi.hoisted(() => ({
  loadFile: vi.fn(),
  updateThumbnail: vi.fn(),
  updateStirlingFileStub: vi.fn(),
  generateThumbnailForFile: vi.fn(),
}));

vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({
    loadFile: mocks.loadFile,
    updateThumbnail: mocks.updateThumbnail,
  }),
}));

vi.mock("@app/contexts/FileContext", () => ({
  useFileManagement: () => ({
    updateStirlingFileStub: mocks.updateStirlingFileStub,
  }),
}));

vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: (...args: unknown[]) =>
    mocks.generateThumbnailForFile(...args),
}));

vi.mock("@app/services/localFolderContents", () => ({
  readDiskFile: vi.fn(),
}));

const FILE_ID = "file-abc" as FileId;

function storeFile(): File {
  return new File([new Uint8Array(8)], "picture.png", { type: "image/png" });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useLazyThumbnail gating", () => {
  it("queues no generation while the row is disabled", async () => {
    const { result } = renderHook(() =>
      useLazyThumbnail(FILE_ID, 2048, undefined, false),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocks.loadFile).not.toHaveBeenCalled();
    expect(mocks.generateThumbnailForFile).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it("generates once when a disabled row becomes enabled", async () => {
    mocks.loadFile.mockResolvedValue(storeFile());
    mocks.generateThumbnailForFile.mockResolvedValue(
      "data:image/png;base64,thumb",
    );

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLazyThumbnail(FILE_ID, 2048, undefined, enabled),
      { initialProps: { enabled: false } },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.loadFile).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current).toBe("data:image/png;base64,thumb");
    });
    expect(mocks.loadFile).toHaveBeenCalledTimes(1);
    expect(mocks.generateThumbnailForFile).toHaveBeenCalledTimes(1);
    expect(mocks.updateThumbnail).toHaveBeenCalledWith(
      FILE_ID,
      "data:image/png;base64,thumb",
    );
  });

  it("does not regenerate after re-enabling a row that already ran", async () => {
    mocks.loadFile.mockResolvedValue(storeFile());
    mocks.generateThumbnailForFile.mockResolvedValue(
      "data:image/png;base64,thumb",
    );

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLazyThumbnail(FILE_ID, 2048, undefined, enabled),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => {
      expect(result.current).toBe("data:image/png;base64,thumb");
    });

    rerender({ enabled: false });
    rerender({ enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocks.loadFile).toHaveBeenCalledTimes(1);
    expect(mocks.generateThumbnailForFile).toHaveBeenCalledTimes(1);
  });
});
