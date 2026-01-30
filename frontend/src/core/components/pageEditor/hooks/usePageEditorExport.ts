import { Dispatch, SetStateAction, useCallback } from "react";

import type {
  useFileActions,
  useFileState,
} from "@app/contexts/FileContext";
import { documentManipulationService } from "@app/services/documentManipulationService";
import { pdfExportService } from "@app/services/pdfExportService";
import { exportProcessedDocumentsToFiles } from "@app/services/pdfExportHelpers";
import { FileId } from "@app/types/file";
import { PDFDocument } from "@app/types/pageEditor";
import { isTauri } from "@tauri-apps/api/core";

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
  setSplitPositions: Dispatch<SetStateAction<Set<number>>>;
}

const removePlaceholderPages = (document: PDFDocument): PDFDocument => {
  const filteredPages = document.pages.filter((page) => !page.isPlaceholder);
  if (filteredPages.length === document.pages.length) {
    return document;
  }

  const normalizedPages = filteredPages.map((page, index) => ({
    ...page,
    pageNumber: index + 1,
  }));

  return {
    ...document,
    pages: normalizedPages,
    totalPages: normalizedPages.length,
  };
};

const normalizeProcessedDocuments = (
  processed: PDFDocument | PDFDocument[]
): PDFDocument | PDFDocument[] => {
  if (Array.isArray(processed)) {
    const normalized = processed
      .map(removePlaceholderPages)
      .filter((doc) => doc.pages.length > 0);
    return normalized;
  }
  return removePlaceholderPages(processed);
};

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
  setSplitPositions,
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

      const normalizedDocuments = normalizeProcessedDocuments(processedDocuments);
      const documentWithDOMState = Array.isArray(normalizedDocuments)
        ? normalizedDocuments[0]
        : normalizedDocuments;

      if (!documentWithDOMState || documentWithDOMState.pages.length === 0) {
        console.warn("Export skipped: no concrete pages available after filtering placeholders.");
        setExportLoading(false);
        return;
      }

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
      setSplitPositions(new Set());
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

      const normalizedDocuments = normalizeProcessedDocuments(processedDocuments);

      if (
        (Array.isArray(normalizedDocuments) && normalizedDocuments.length === 0) ||
        (!Array.isArray(normalizedDocuments) && normalizedDocuments.pages.length === 0)
      ) {
        console.warn("Export skipped: no concrete pages available after filtering placeholders.");
        setExportLoading(false);
        return;
      }

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const files = await exportProcessedDocumentsToFiles(
        normalizedDocuments,
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
      setSplitPositions(new Set());
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

      const normalizedDocuments = normalizeProcessedDocuments(processedDocuments);

      if (
        (Array.isArray(normalizedDocuments) && normalizedDocuments.length === 0) ||
        (!Array.isArray(normalizedDocuments) && normalizedDocuments.pages.length === 0)
      ) {
        console.warn("Apply changes skipped: no concrete pages available after filtering placeholders.");
        setExportLoading(false);
        return;
      }

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const files = await exportProcessedDocumentsToFiles(
        normalizedDocuments,
        sourceFiles,
        exportFilename
      );

      // Add "_multitool" suffix to filenames
      const renamedFiles = files.map(file => {
        const nameParts = file.name.match(/^(.+?)(\.pdf)$/i);
        if (nameParts) {
          const baseName = nameParts[1];
          const extension = nameParts[2];
          const newName = `${baseName}_multitool${extension}`;
          return new File([file], newName, { type: file.type });
        }
        return file;
      });

      // Store source file IDs before adding new files
      const sourceFileIds = [...selectedFileIds];

      const newStirlingFiles = await actions.addFiles(renamedFiles, {
        selectFiles: true,
      });
      if (newStirlingFiles.length > 0) {
        actions.setSelectedFiles(newStirlingFiles.map((file) => file.fileId));
      }

      // Auto-save to local path if single source had one (desktop only)
      if (isTauri() && sourceFileIds.length === 1 && newStirlingFiles.length === 1) {
        const sourceStub = selectors.getStirlingFileStub(sourceFileIds[0]);
        if (sourceStub?.localFilePath && renamedFiles[0]) {
          try {
            // @ts-ignore - Desktop module not available in proprietary build
            const { saveToLocalPath } = await import("@desktop/services/localFileSaveService");
            const result = await saveToLocalPath(renamedFiles[0], sourceStub.localFilePath);
            if (result.success) {
              console.log(`[PageEditor] Auto-saved to ${sourceStub.localFilePath}`);
              // Preserve localFilePath in output file
              actions.updateStirlingFileStub(newStirlingFiles[0].fileId, {
                localFilePath: sourceStub.localFilePath
              });
            } else {
              console.warn('[PageEditor] Auto-save failed:', result.error);
            }
          } catch (error) {
            console.error('[PageEditor] Auto-save error:', error);
          }
        }
      }

      // Prompt for folder if single source with local path produced multiple outputs (desktop only)
      if (isTauri() && sourceFileIds.length === 1 && newStirlingFiles.length > 1) {
        const sourceStub = selectors.getStirlingFileStub(sourceFileIds[0]);
        if (sourceStub?.localFilePath && renamedFiles.length > 0) {
          try {
            // @ts-ignore - Desktop module not available in proprietary build
            const { saveMultipleFilesWithPrompt } = await import("@desktop/services/localFileSaveService");
            const { dirname } = await import("@tauri-apps/api/path");

            // Get directory of original file as default
            const defaultDir = await dirname(sourceStub.localFilePath);

            const result = await saveMultipleFilesWithPrompt(renamedFiles, defaultDir);

            if (result.success) {
              console.log(`[PageEditor] Saved ${result.savedCount} files to user-selected folder`);
            } else if (result.cancelledByUser) {
              console.log('[PageEditor] User cancelled save dialog - files remain in workbench');
            } else {
              console.warn('[PageEditor] Multi-file save failed:', result.error);
            }
          } catch (error) {
            console.error('[PageEditor] Multi-file save error:', error);
          }
        }
      }

      // Remove source files from context
      if (sourceFileIds.length > 0) {
        await actions.removeFiles(sourceFileIds, true);
      }

      setHasUnsavedChanges(false);
      setSplitPositions(new Set());
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
    selectedFileIds,
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
