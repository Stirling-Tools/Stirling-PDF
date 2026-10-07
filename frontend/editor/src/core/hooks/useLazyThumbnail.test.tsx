import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLazyThumbnail } from "@app/hooks/useLazyThumbnail";
import { createStirlingFile, type FileId } from "@app/types/fileContext";
import {
  clearPdfAccess,
  forgetPdfAccess,
  rememberPdfAccess,
} from "@app/services/pdfPasswordStore";

const storage = vi.hoisted(() => ({
  loadFile: vi.fn(),
  updateThumbnail: vi.fn(),
}));
const management = vi.hoisted(() => ({ updateStirlingFileStub: vi.fn() }));
const selectors = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => storage,
}));
vi.mock("@app/contexts/FileContext", () => ({
  useFileManagement: () => management,
  useFileSelectors: () => selectors,
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: vi.fn(),
}));

const access = {
  password: "secret",
  encrypted: true,
  signed: false,
  ownerAuthenticated: true,
  permissions: -4,
  canModify: true,
  canAssemble: true,
  pageCount: 1,
};
const id = "protected-preview" as FileId;
const thumbnail = "data:image/png;base64,cached";

afterEach(() => {
  cleanup();
  clearPdfAccess();
  vi.clearAllMocks();
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
    const { result, rerender } = renderHook(
      ({
        fileId,
        encrypted,
        url,
      }: {
        fileId: FileId;
        encrypted: boolean;
        url: string | undefined;
      }) => useLazyThumbnail(fileId, 42, url, encrypted),
      {
        initialProps: {
          fileId: id,
          encrypted: false,
          url: thumbnail,
        },
      },
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
      await import("@app/utils/thumbnailUtils");
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
