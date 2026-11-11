import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMetadataExtraction } from "@editor/hooks/tools/changeMetadata/useMetadataExtraction";
import { clearPdfAccess } from "@editor/services/pdfAccessService";
import {
  clearRightsManagedPdfs,
  isMicrosoftProtectedPdf,
} from "@editor/services/rightsManagedPdf";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  openInViewer,
  pdfFile,
  rememberSessionPassword,
  servePdfs,
} from "@editor/tests/utils/protectedPdfFixtures";

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn() }));
const scope = vi.hoisted(() => ({ files: [] as File[] }));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfjs.getDocument,
}));
vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock("@editor/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: async () => "",
}));
vi.mock("@editor/hooks/tools/shared/useViewScopedFiles", () => ({
  useViewScopedFiles: () => scope.files,
}));

const COVER = "%PDF-1.7 cover /MicrosoftIRMServices";
const REPORT = "%PDF-1.7 quarterly report";
const SECOND = "%PDF-1.7 second report";
const coverInfo = { Title: "Protected document", Author: "Microsoft" };
const reportInfo = { Title: "Quarterly report", Author: "Alice Example" };

function extract() {
  const updateParameter = vi.fn();
  const hook = renderHook(() => useMetadataExtraction({ updateParameter }));
  return Object.assign(updateParameter, { rerender: hook.rerender });
}

beforeEach(() => {
  pdfjs.getDocument.mockReset();
  clearPdfAccess();
  clearRightsManagedPdfs();
});
afterEach(() => {
  scope.files = [];
});

describe("useMetadataExtraction", () => {
  it("pre-fills an unprotected PDF as stored", async () => {
    const file = createStirlingFile(pdfFile(REPORT));
    scope.files = [file];
    pdfjs.getDocument.mockImplementation(
      servePdfs({ text: REPORT, info: reportInfo }),
    );

    const updateParameter = extract();

    await waitFor(() =>
      expect(updateParameter).toHaveBeenCalledWith("title", "Quarterly report"),
    );
  });

  it("pre-fills a password-protected PDF with the session password", async () => {
    const file = createStirlingFile(pdfFile(REPORT));
    rememberSessionPassword(file, "secret");
    scope.files = [file];
    pdfjs.getDocument.mockImplementation(
      servePdfs({ text: REPORT, password: "secret", info: reportInfo }),
    );

    const updateParameter = extract();

    await waitFor(() =>
      expect(updateParameter).toHaveBeenCalledWith("title", "Quarterly report"),
    );
    expect(updateParameter).toHaveBeenCalledWith("author", "Alice Example");
  });

  it("pre-fills an opened Purview PDF from its decrypted copy, not the cover", async () => {
    const file = createStirlingFile(pdfFile(COVER));
    await openInViewer(file, REPORT);
    scope.files = [file];
    pdfjs.getDocument.mockImplementation(
      servePdfs(
        { text: COVER, info: coverInfo },
        { text: REPORT, info: reportInfo },
      ),
    );

    const updateParameter = extract();

    await waitFor(() =>
      expect(updateParameter).toHaveBeenCalledWith("title", "Quarterly report"),
    );
    expect(updateParameter).not.toHaveBeenCalledWith(
      "title",
      "Protected document",
    );
  });

  it("waits for the viewer to open a Purview PDF instead of pre-filling the cover", async () => {
    const file = createStirlingFile(pdfFile(COVER));
    scope.files = [file];
    pdfjs.getDocument.mockImplementation(
      servePdfs(
        { text: COVER, info: coverInfo },
        { text: REPORT, info: reportInfo },
      ),
    );

    const updateParameter = extract();
    await act(() => isMicrosoftProtectedPdf(file));
    await act(() => openInViewer(file, REPORT));

    await waitFor(() =>
      expect(updateParameter).toHaveBeenCalledWith("title", "Quarterly report"),
    );
    expect(updateParameter).not.toHaveBeenCalledWith(
      "title",
      "Protected document",
    );
  });

  it("does not copy a decrypted PDF's metadata onto other files in the run", async () => {
    const file = createStirlingFile(pdfFile(COVER));
    const other = createStirlingFile(pdfFile(REPORT));
    await openInViewer(file, REPORT);
    scope.files = [file];
    pdfjs.getDocument.mockImplementation(
      servePdfs(
        { text: COVER, info: coverInfo },
        { text: REPORT, info: reportInfo },
      ),
    );

    const updateParameter = extract();
    await waitFor(() =>
      expect(updateParameter).toHaveBeenCalledWith("title", "Quarterly report"),
    );
    updateParameter.mockClear();

    scope.files = [file, other];
    updateParameter.rerender();

    await waitFor(() =>
      expect(updateParameter).toHaveBeenCalledWith("title", ""),
    );
    expect(updateParameter).toHaveBeenCalledWith("author", "");
    expect(updateParameter).not.toHaveBeenCalledWith(
      "title",
      "Quarterly report",
    );
  });

  it("re-reads the metadata when the first file changes", async () => {
    const first = createStirlingFile(pdfFile(REPORT));
    const second = createStirlingFile(pdfFile(SECOND));
    scope.files = [first];
    pdfjs.getDocument.mockImplementation(
      servePdfs(
        { text: REPORT, info: reportInfo },
        { text: SECOND, info: { Title: "Second", Author: "Bob" } },
      ),
    );

    const updateParameter = extract();
    await waitFor(() =>
      expect(updateParameter).toHaveBeenCalledWith("title", "Quarterly report"),
    );

    scope.files = [second];
    updateParameter.rerender();

    await waitFor(() =>
      expect(updateParameter).toHaveBeenCalledWith("title", "Second"),
    );
  });
});
