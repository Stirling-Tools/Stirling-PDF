import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePageEditorExport } from "@app/components/pageEditor/hooks/usePageEditorExport";
import { enforceExportPolicies } from "@app/services/policyExport";
import { downloadFile } from "@app/services/downloadService";
import { exportProcessedDocumentsToFiles } from "@app/services/pdfExportHelpers";
import { pdfExportService } from "@app/services/pdfExportService";
import { alert } from "@app/components/toast";
import type { FileId } from "@app/types/file";

const { zipFile, generateZip } = vi.hoisted(() => ({
  zipFile: vi.fn(),
  generateZip: vi.fn(),
}));

vi.mock("jszip", () => ({
  default: class {
    file = zipFile;
    generateAsync = generateZip;
  },
}));
vi.mock("@app/services/policyExport", () => ({
  enforceExportPolicies: vi.fn(),
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("@app/services/downloadService", () => ({ downloadFile: vi.fn() }));
vi.mock("@app/services/pdfExportHelpers", () => ({
  exportProcessedDocumentsToFiles: vi.fn(),
}));
vi.mock("@app/services/pdfExportService", () => ({
  pdfExportService: { exportPDF: vi.fn(), exportPDFMultiFile: vi.fn() },
}));
vi.mock("@app/services/documentManipulationService", () => ({
  documentManipulationService: {
    applyDOMChangesToDocument: (doc: unknown) => doc,
  },
}));

type Params = Parameters<typeof usePageEditorExport>[0];
const sourceId = "source" as FileId;
const pdf = (name: string) =>
  new File(["%PDF"], name, { type: "application/pdf" });

function params(): Params {
  return {
    displayDocument: {
      id: sourceId,
      name: "doc.pdf",
      file: pdf("doc.pdf"),
      totalPages: 1,
      pages: [
        {
          id: "page",
          pageNumber: 1,
          originalPageNumber: 1,
          originalFileId: sourceId,
          thumbnail: null,
          rotation: 0,
          selected: true,
        },
      ],
    },
    selectedPageIds: ["page"],
    selectedFileIds: [sourceId],
    splitPositions: new Set(),
    selectors: {
      getFile: vi.fn(),
      getPolicyBlock: vi.fn(),
      getStirlingFileStub: vi.fn(),
    },
    actions: {
      setSelectedFiles: vi.fn(),
      removeFiles: vi.fn(),
      addFiles: vi.fn<Params["actions"]["addFiles"]>().mockResolvedValue([]),
      updateStirlingFileStub: vi.fn(),
    },
    exportLoading: false,
    setExportLoading: vi.fn(),
    setHasUnsavedChanges: vi.fn(),
    setSplitPositions: vi.fn(),
    clearPersistedDocument: vi.fn(),
    updateCurrentPages: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(downloadFile).mockResolvedValue({});
  vi.mocked(enforceExportPolicies).mockImplementation(async (files) => ({
    files,
    blocked: [],
  }));
  vi.mocked(pdfExportService.exportPDF).mockResolvedValue({
    blob: pdf("selected.pdf"),
    filename: "selected.pdf",
  });
  vi.mocked(exportProcessedDocumentsToFiles).mockResolvedValue([
    pdf("all.pdf"),
  ]);
  generateZip.mockResolvedValue(
    new Blob(["archive"], { type: "application/zip" }),
  );
});

describe("Page Editor policy enforcement", () => {
  it.each(["onExportSelected", "onExportAll", "applyChanges"] as const)(
    "rejects blocked source files in %s",
    async (action) => {
      const input = params();
      vi.mocked(input.selectors.getPolicyBlock).mockReturnValue("security");
      const { result } = renderHook(() => usePageEditorExport(input));
      await act(() => result.current[action]());
      expect(alert).toHaveBeenCalled();
      expect(pdfExportService.exportPDF).not.toHaveBeenCalled();
      expect(exportProcessedDocumentsToFiles).not.toHaveBeenCalled();
      expect(downloadFile).not.toHaveBeenCalled();
      expect(input.actions.removeFiles).not.toHaveBeenCalled();
      expect(input.actions.addFiles).not.toHaveBeenCalled();
    },
  );

  it("checks inserted pages whose source is outside the selected file IDs", async () => {
    const input = params();
    const insertedId = "inserted" as FileId;
    input.displayDocument!.pages[0].originalFileId = insertedId;
    vi.mocked(input.selectors.getPolicyBlock).mockImplementation((id) =>
      id === insertedId ? "security" : undefined,
    );
    const { result } = renderHook(() => usePageEditorExport(input));
    await act(() => result.current.onExportAll());
    expect(alert).toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("enforces each split PDF before building the ZIP, using the enforced bytes", async () => {
    const input = params();
    const originals = [pdf("one.pdf"), pdf("two.pdf")];
    const enforced = [pdf("safe-one.pdf"), pdf("safe-two.pdf")];
    vi.mocked(exportProcessedDocumentsToFiles).mockResolvedValue(originals);
    vi.mocked(enforceExportPolicies).mockResolvedValue({
      files: enforced,
      blocked: [],
    });
    const { result } = renderHook(() => usePageEditorExport(input));
    await act(() => result.current.onExportAll());
    expect(enforceExportPolicies).toHaveBeenCalledWith(originals);
    expect(zipFile.mock.calls).toEqual(
      enforced.map((file) => [file.name, file]),
    );
    expect(downloadFile).toHaveBeenCalledWith({
      data: expect.any(Blob),
      filename: "doc.zip",
    });
    expect(input.setHasUnsavedChanges).toHaveBeenCalledWith(false);
  });

  it.each(["onExportSelected", "onExportAll"] as const)(
    "keeps edits dirty when a required export policy fails in %s",
    async (action) => {
      const input = params();
      vi.mocked(enforceExportPolicies).mockResolvedValue({
        files: [pdf("blocked.pdf")],
        blocked: ["blocked.pdf"],
      });
      const { result } = renderHook(() => usePageEditorExport(input));
      await act(() => result.current[action]());
      expect(downloadFile).not.toHaveBeenCalled();
      expect(generateZip).not.toHaveBeenCalled();
      expect(input.setHasUnsavedChanges).not.toHaveBeenCalled();
      expect(input.setExportLoading).toHaveBeenLastCalledWith(false);
    },
  );

  it("rechecks sources if they become blocked while generating edited files", async () => {
    const input = params();
    vi.mocked(exportProcessedDocumentsToFiles).mockImplementation(async () => {
      vi.mocked(input.selectors.getPolicyBlock).mockReturnValue("security");
      return [pdf("edited.pdf")];
    });
    const { result } = renderHook(() => usePageEditorExport(input));
    await act(() => result.current.applyChanges());
    expect(input.actions.addFiles).not.toHaveBeenCalled();
    expect(input.actions.removeFiles).not.toHaveBeenCalled();
    expect(input.setHasUnsavedChanges).not.toHaveBeenCalled();
  });
});
