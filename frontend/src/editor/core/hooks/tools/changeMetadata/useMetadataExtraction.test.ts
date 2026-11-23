import { renderHook, act } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

const { extractPDFMetadata, files } = vi.hoisted(() => ({
  extractPDFMetadata: vi.fn(),
  files: [{ fileId: "file-1" }],
}));

vi.mock("@editor/services/pdfMetadataService", () => ({ extractPDFMetadata }));
vi.mock("@editor/hooks/tools/shared/useViewScopedFiles", () => ({
  useViewScopedFiles: () => files,
}));

import { useMetadataExtraction } from "@editor/hooks/tools/changeMetadata/useMetadataExtraction";

const METADATA = {
  title: "Title",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
  creationDate: null,
  modificationDate: null,
  trapped: "UNKNOWN",
  customMetadata: [],
};

// The parameters hook hands back a new object on every render, so the
// extraction effect re-runs while the first read is still in flight.
describe("useMetadataExtraction", () => {
  beforeEach(() => extractPDFMetadata.mockReset());

  test("reads the PDF once while re-rendering during the read", async () => {
    let finish: (value: unknown) => void = () => {};
    extractPDFMetadata.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const updateParameter = vi.fn();
    const { rerender } = renderHook(() =>
      useMetadataExtraction({
        updateParameter: (...args) => updateParameter(...args),
      }),
    );
    rerender();
    rerender();

    await act(async () => finish({ success: true, metadata: METADATA }));

    expect(extractPDFMetadata).toHaveBeenCalledTimes(1);
    expect(updateParameter).toHaveBeenCalledWith("title", "Title");
  });
});
