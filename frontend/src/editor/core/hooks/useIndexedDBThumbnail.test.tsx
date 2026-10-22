import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { StirlingFileStub } from "@app/types/fileContext";

const mocks = vi.hoisted(() => ({
  generateThumbnailForFile: vi.fn(),
  updateStirlingFileStub: vi.fn(),
  indexedDB: { loadFile: vi.fn(), updateThumbnail: vi.fn() },
  selectors: { getFile: () => null },
}));

vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => mocks.indexedDB,
}));

vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: mocks.generateThumbnailForFile,
}));

vi.mock("@app/services/pdfPasswordStore", () => ({
  getPdfAccess: () => null,
}));

vi.mock("@app/contexts/FileContext", () => ({
  useFileManagement: () => ({
    updateStirlingFileStub: mocks.updateStirlingFileStub,
  }),
  useFileSelectors: () => mocks.selectors,
}));

import { useIndexedDBThumbnail } from "@app/hooks/useIndexedDBThumbnail";

function makeStub(overrides: Partial<StirlingFileStub> = {}): StirlingFileStub {
  return {
    id: "file-1",
    name: "doc.pdf",
    size: 1024,
    lastModified: 1000,
    ...overrides,
  } as StirlingFileStub;
}

describe("useIndexedDBThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.indexedDB.loadFile.mockResolvedValue({ name: "doc.pdf" });
    mocks.generateThumbnailForFile.mockResolvedValue(
      "data:image/png;base64,rendered",
    );
  });

  it("keeps the rendered thumbnail when the stub copy is evicted", async () => {
    const { result, rerender } = renderHook(
      ({ file }: { file: StirlingFileStub }) => useIndexedDBThumbnail(file),
      { initialProps: { file: makeStub() } },
    );

    await waitFor(() =>
      expect(result.current.thumbnail).toBe("data:image/png;base64,rendered"),
    );
    expect(mocks.generateThumbnailForFile).toHaveBeenCalledTimes(1);

    rerender({ file: makeStub() });

    await waitFor(() =>
      expect(result.current.thumbnail).toBe("data:image/png;base64,rendered"),
    );
    expect(mocks.generateThumbnailForFile).toHaveBeenCalledTimes(1);
  });

  it("regenerates after the file version changes", async () => {
    const { rerender } = renderHook(
      ({ file }: { file: StirlingFileStub }) => useIndexedDBThumbnail(file),
      { initialProps: { file: makeStub() } },
    );

    await waitFor(() =>
      expect(mocks.generateThumbnailForFile).toHaveBeenCalledTimes(1),
    );

    rerender({ file: makeStub({ lastModified: 2000 }) });

    await waitFor(() =>
      expect(mocks.generateThumbnailForFile).toHaveBeenCalledTimes(2),
    );
  });
});
