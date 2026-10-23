import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateThumbnailForFile } from "@editor/utils/thumbnailUtils";
import { useLazyThumbnail } from "@editor/hooks/useLazyThumbnail";
import { createStirlingFile, type FileId } from "@editor/types/fileContext";
import {
  clearPdfAccess,
  forgetPdfAccess,
  rememberPdfAccess,
} from "@editor/services/pdfAccessService";

const storage = vi.hoisted(() => ({
  loadFile: vi.fn(),
  updateThumbnail: vi.fn(),
}));
const management = vi.hoisted(() => ({ updateStirlingFileStub: vi.fn() }));
const selectors = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("@editor/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => storage,
}));
vi.mock("@editor/contexts/FileContext", () => ({
  useFileManagement: () => management,
  useFileSelectors: () => selectors,
}));
vi.mock("@editor/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: vi.fn(),
}));

const access = {
  password: "secret",
  encrypted: true,
  signed: false,
  ownerAuthenticated: true,
  permissions: -4,
  pageCount: 1,
};
const id = "protected-preview" as FileId;
const thumbnail = "data:image/png;base64,cached";

afterEach(() => {
  cleanup();
  clearPdfAccess();
  vi.resetAllMocks();
});

describe("protected cached thumbnails", () => {
  it("requires this session's unlock, and hides the preview again on close or logout", () => {
    const file = createStirlingFile(new File(["encrypted"], "private.pdf"), id);
    const { result } = renderHook(() =>
      useLazyThumbnail(id, file.size, thumbnail, true),
    );
    expect(result.current).toBeUndefined();
    expect(storage.loadFile).not.toHaveBeenCalled();
    act(() => rememberPdfAccess(file, access));
    expect(result.current).toBe(thumbnail);
    act(() => forgetPdfAccess([id]));
    expect(result.current).toBeUndefined();
    act(() => rememberPdfAccess(file, access));
    expect(result.current).toBe(thumbnail);
    act(() => clearPdfAccess());
    expect(result.current).toBeUndefined();
  });

  it("does not reuse the old row's preview when a different protected version replaces it", () => {
    const initialProps: {
      fileId: FileId;
      encrypted: boolean;
      url: string | undefined;
    } = { fileId: id, encrypted: false, url: thumbnail };
    const { result, rerender } = renderHook(
      ({ fileId, encrypted, url }) =>
        useLazyThumbnail(fileId, 42, url, encrypted),
      { initialProps },
    );
    expect(result.current).toBe(thumbnail);
    rerender({
      fileId: "new-version" as FileId,
      encrypted: true,
      url: undefined,
    });
    expect(result.current).toBeUndefined();
  });

  it("starts thumbnail generation after unlocking when the locked row has no cache", async () => {
    const file = createStirlingFile(new File(["encrypted"], "private.pdf"), id);
    selectors.getFile.mockReturnValue(file);
    const { generateThumbnailForFile } =
      await import("@editor/utils/thumbnailUtils");
    vi.mocked(generateThumbnailForFile).mockResolvedValue(thumbnail);
    const { result, rerender } = renderHook(() =>
      useLazyThumbnail(id, file.size, undefined, true),
    );
    expect(storage.loadFile).not.toHaveBeenCalled();
    act(() => rememberPdfAccess(file, access));
    await waitFor(() => expect(result.current).toBe(thumbnail));
    expect(storage.loadFile).not.toHaveBeenCalled();
    management.updateStirlingFileStub = vi.fn();
    await act(async () => rerender());
    expect(generateThumbnailForFile).toHaveBeenCalledTimes(1);
    expect(storage.updateThumbnail).toHaveBeenCalledWith(id, thumbnail, true);
    act(() => clearPdfAccess());
    expect(result.current).toBeUndefined();
  });
});

describe("useLazyThumbnail gating", () => {
  it("queues no generation while the row is disabled", async () => {
    const { result } = renderHook(() =>
      useLazyThumbnail(id, 2048, undefined, false, false),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(storage.loadFile).not.toHaveBeenCalled();
    expect(vi.mocked(generateThumbnailForFile)).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it("generates once when a disabled row becomes enabled", async () => {
    storage.loadFile.mockResolvedValue(new File(["image"], "image.png"));
    vi.mocked(generateThumbnailForFile).mockResolvedValue(
      "data:image/png;base64,thumb",
    );

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLazyThumbnail(id, 2048, undefined, false, enabled),
      { initialProps: { enabled: false } },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(storage.loadFile).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current).toBe("data:image/png;base64,thumb");
    });
    expect(storage.loadFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateThumbnailForFile)).toHaveBeenCalledTimes(1);
    expect(storage.updateThumbnail).toHaveBeenCalledWith(
      id,
      "data:image/png;base64,thumb",
      false,
    );
  });

  it("does not regenerate after re-enabling a row that already ran", async () => {
    storage.loadFile.mockResolvedValue(new File(["image"], "image.png"));
    vi.mocked(generateThumbnailForFile).mockResolvedValue(
      "data:image/png;base64,thumb",
    );

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLazyThumbnail(id, 2048, undefined, false, enabled),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => {
      expect(result.current).toBe("data:image/png;base64,thumb");
    });

    rerender({ enabled: false });
    rerender({ enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(storage.loadFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateThumbnailForFile)).toHaveBeenCalledTimes(1);
  });
});
