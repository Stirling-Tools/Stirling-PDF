import { useCallback } from "react";

import type {
  useFileActions,
  useFileState,
} from "@app/contexts/FileContext";
import { documentManipulationService } from "@app/services/documentManipulationService";
import { pdfExportService } from "@app/services/pdfExportService";
import { exportProcessedDocumentsToFiles } from "@app/services/pdfExportHelpers";
import { FileId } from "@app/types/file";
import { PDFDocument } from "@app/types/pageEditor";

type FileActions = ReturnType<typeof useFileActions>["actions"];
type FileSelectors = ReturnType<typeof useFileState>["selectors"];

interface UsePageEditorExportParams {
  displayDocument: PDFDocument | null;
  selectedPageIds: string[];
  splitPositions: Set<number>;
  selectedFileIds: FileId[];
  selectors: FileSelectors;
  actions: FileActions;
  setHasUnsavedChanges: (dirty: boolean) => void;
  exportLoading: boolean;
  setExportLoading: (loading: boolean) => void;
}

export const usePageEditorExport = ({
  displayDocument,
  selectedPageIds,
  splitPositions,
  selectedFileIds,
  selectors,
  actions,
  setHasUnsavedChanges,
  exportLoading,
  setExportLoading,
}: UsePageEditorExportParams) => {
  const getSourceFiles = useCallback((): Map<FileId, File> | null => {
    const sourceFiles = new Map<FileId, File>();

    selectedFileIds.forEach((fileId) => {
      const file = selectors.getFile(fileId);
      if (file) {
        sourceFiles.set(fileId, file);
      }
    });

    const hasInsertedFiles = false;
    const hasMultipleOriginalFiles = selectedFileIds.length > 1;

    if (!hasInsertedFiles && !hasMultipleOriginalFiles) {
      return null;
    }

    return sourceFiles.size > 0 ? sourceFiles : null;
  }, [selectedFileIds, selectors]);

  const getExportFilename = useCallback((): string => {
    if (selectedFileIds.length <= 1) {
      return displayDocument?.name || "document.pdf";
    }

    const firstFile = selectors.getFile(selectedFileIds[0]);
    if (firstFile) {
      const baseName = firstFile.name.replace(/\.pdf$/i, "");
      return `${baseName} (merged).pdf`;
    }

    return "merged-document.pdf";
  }, [selectedFileIds, selectors, displayDocument]);

  const onExportSelected = useCallback(async () => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    setExportLoading(true);
    try {
      const processedDocuments =
        documentManipulationService.applyDOMChangesToDocument(
          displayDocument,
          displayDocument,
          splitPositions
        );

      const documentWithDOMState = Array.isArray(processedDocuments)
        ? processedDocuments[0]
        : processedDocuments;

      const validSelectedPageIds = selectedPageIds.filter((pageId) =>
        documentWithDOMState.pages.some((page) => page.id === pageId)
      );

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const result = sourceFiles
        ? await pdfExportService.exportPDFMultiFile(
            documentWithDOMState,
            sourceFiles,
            validSelectedPageIds,
            { selectedOnly: true, filename: exportFilename }
          )
        : await pdfExportService.exportPDF(
            documentWithDOMState,
            validSelectedPageIds,
            { selectedOnly: true, filename: exportFilename }
          );

      pdfExportService.downloadFile(result.blob, result.filename);
      setHasUnsavedChanges(false);
      setExportLoading(false);
    } catch (error) {
      console.error("Export failed:", error);
      setExportLoading(false);
    }
  }, [
    displayDocument,
    selectedPageIds,
    splitPositions,
    getSourceFiles,
    getExportFilename,
    setHasUnsavedChanges,
    setExportLoading,
  ]);

  const onExportAll = useCallback(async () => {
    if (!displayDocument) return;

    setExportLoading(true);
    try {
      const processedDocuments =
        documentManipulationService.applyDOMChangesToDocument(
          displayDocument,
          displayDocument,
          splitPositions
        );

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const files = await exportProcessedDocumentsToFiles(
        processedDocuments,
        sourceFiles,
        exportFilename
      );

      if (files.length > 1) {
        const JSZip = await import("jszip");
        const zip = new JSZip.default();

        files.forEach((file) => {
          zip.file(file.name, file);
        });

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipFilename = exportFilename.replace(/\.pdf$/i, ".zip");

        pdfExportService.downloadFile(zipBlob, zipFilename);
      } else {
        const file = files[0];
        pdfExportService.downloadFile(file, file.name);
      }

      setHasUnsavedChanges(false);
      setExportLoading(false);
    } catch (error) {
      console.error("Export failed:", error);
      setExportLoading(false);
    }
  }, [
    displayDocument,
    splitPositions,
    getSourceFiles,
    getExportFilename,
    setHasUnsavedChanges,
    setExportLoading,
  ]);

  const applyChanges = useCallback(async () => {
    if (!displayDocument) return;

    setExportLoading(true);
    try {
      const processedDocuments =
        documentManipulationService.applyDOMChangesToDocument(
          displayDocument,
          displayDocument,
          splitPositions
        );

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const files = await exportProcessedDocumentsToFiles(
        processedDocuments,
        sourceFiles,
        exportFilename
      );

      const newStirlingFiles = await actions.addFiles(files, {
        selectFiles: true,
      });
      if (newStirlingFiles.length > 0) {
        actions.setSelectedFiles(newStirlingFiles.map((file) => file.fileId));
      }

      setHasUnsavedChanges(false);
      setExportLoading(false);
    } catch (error) {
      console.error("Apply changes failed:", error);
      setExportLoading(false);
    }
  }, [
    displayDocument,
    splitPositions,
    getSourceFiles,
    getExportFilename,
    actions,
    setHasUnsavedChanges,
    setExportLoading,
  ]);

  return {
    exportLoading,
    onExportSelected,
    onExportAll,
    applyChanges,
  };
};

export type UsePageEditorExportReturn = ReturnType<typeof usePageEditorExport>;
