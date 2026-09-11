import { Dispatch, SetStateAction, useCallback } from "react";
import { useTranslation } from "react-i18next";

import type { useFileActions, useFileState } from "@app/contexts/FileContext";
import { documentManipulationService } from "@app/services/documentManipulationService";
import { pdfExportService } from "@app/services/pdfExportService";
import { exportProcessedDocumentsToFiles } from "@app/services/pdfExportHelpers";
import { enforceExportPolicies } from "@app/services/policyExport";
import { downloadFile } from "@app/services/downloadService";
import { alert } from "@app/components/toast";
import { FileId } from "@app/types/file";
import { PDFDocument, PDFPage } from "@app/types/pageEditor";

type FileActions = Pick<
  ReturnType<typeof useFileActions>["actions"],
  "setSelectedFiles" | "removeFiles" | "addFiles" | "updateStirlingFileStub"
>;
type FileSelectors = Pick<
  ReturnType<typeof useFileState>["selectors"],
  "getFile" | "getPolicyBlock" | "getStirlingFileStub"
>;

interface UsePageEditorExportParams {
  displayDocument: PDFDocument | null;
  selectedPageIds: string[];
  splitPositions: Set<string>;
  selectedFileIds: FileId[];
  selectors: FileSelectors;
  actions: FileActions;
  setHasUnsavedChanges: (dirty: boolean) => void;
  exportLoading: boolean;
  setExportLoading: (loading: boolean) => void;
  setSplitPositions: Dispatch<SetStateAction<Set<string>>>;
  clearPersistedDocument: () => void;
  updateCurrentPages: (pages: PDFPage[] | null) => void;
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
  processed: PDFDocument | PDFDocument[],
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
  clearPersistedDocument,
  updateCurrentPages,
}: UsePageEditorExportParams) => {
  const { t } = useTranslation();
  const canUseSourceFiles = useCallback(() => {
    const sourceIds = new Set(selectedFileIds);
    for (const page of displayDocument?.pages ?? []) {
      if (page.originalFileId) sourceIds.add(page.originalFileId);
    }
    const blocked = [...sourceIds].filter((id) => selectors.getPolicyBlock(id));
    if (blocked.length === 0) return true;
    alert({
      alertType: "error",
      title: t("policy.blockedTitle"),
      body: t("policyBlockedFilesBlocked", { count: blocked.length }),
    });
    return false;
  }, [selectedFileIds, displayDocument, selectors, t]);

  const downloadExportedFiles = useCallback(
    async (files: File[], filename: string) => {
      if (!canUseSourceFiles()) return false;
      // These are edited outputs: source IDs would incorrectly reuse enforcement of the old bytes.
      const result = await enforceExportPolicies(files);
      if (result.blocked.length > 0 || !canUseSourceFiles()) return false;
      let data: Blob;
      if (result.files.length > 1) {
        const JSZip = await import("jszip");
        const zip = new JSZip.default();
        for (const file of result.files) zip.file(file.name, file);
        data = await zip.generateAsync({ type: "blob" });
        filename = filename.replace(/\.pdf$/i, ".zip");
      } else {
        const file = result.files[0];
        if (!file) return false;
        data = file;
        filename = file.name;
      }
      if (!canUseSourceFiles()) return false;
      return !(await downloadFile({ data, filename })).cancelled;
    },
    [canUseSourceFiles],
  );

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
    if (!canUseSourceFiles()) return;

    setExportLoading(true);
    try {
      const processedDocuments =
        documentManipulationService.applyDOMChangesToDocument(
          displayDocument,
          displayDocument,
          splitPositions,
        );

      const normalizedDocuments =
        normalizeProcessedDocuments(processedDocuments);
      const documentWithDOMState = Array.isArray(normalizedDocuments)
        ? normalizedDocuments[0]
        : normalizedDocuments;

      if (!documentWithDOMState || documentWithDOMState.pages.length === 0) {
        console.warn(
          "Export skipped: no concrete pages available after filtering placeholders.",
        );
        setExportLoading(false);
        return;
      }

      const validSelectedPageIds = selectedPageIds.filter((pageId) =>
        documentWithDOMState.pages.some((page) => page.id === pageId),
      );

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const result = sourceFiles
        ? await pdfExportService.exportPDFMultiFile(
            documentWithDOMState,
            sourceFiles,
            validSelectedPageIds,
            {
              selectedOnly: true,
              filename: exportFilename,
            },
          )
        : await pdfExportService.exportPDF(
            documentWithDOMState,
            validSelectedPageIds,
            {
              selectedOnly: true,
              filename: exportFilename,
            },
          );

      const downloaded = await downloadExportedFiles(
        [new File([result.blob], result.filename, { type: "application/pdf" })],
        result.filename,
      );
      if (!downloaded) {
        setExportLoading(false);
        return;
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
    selectedPageIds,
    splitPositions,
    getSourceFiles,
    getExportFilename,
    setHasUnsavedChanges,
    setExportLoading,
    canUseSourceFiles,
    downloadExportedFiles,
  ]);

  const onExportAll = useCallback(async () => {
    if (!displayDocument) return;
    if (!canUseSourceFiles()) return;

    setExportLoading(true);
    try {
      const processedDocuments =
        documentManipulationService.applyDOMChangesToDocument(
          displayDocument,
          displayDocument,
          splitPositions,
        );

      const normalizedDocuments =
        normalizeProcessedDocuments(processedDocuments);

      if (
        (Array.isArray(normalizedDocuments) &&
          normalizedDocuments.length === 0) ||
        (!Array.isArray(normalizedDocuments) &&
          normalizedDocuments.pages.length === 0)
      ) {
        console.warn(
          "Export skipped: no concrete pages available after filtering placeholders.",
        );
        setExportLoading(false);
        return;
      }

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const files = await exportProcessedDocumentsToFiles(
        normalizedDocuments,
        sourceFiles,
        exportFilename,
      );

      if (!(await downloadExportedFiles(files, exportFilename))) {
        setExportLoading(false);
        return;
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
    canUseSourceFiles,
    downloadExportedFiles,
  ]);

  const applyChanges = useCallback(async () => {
    if (!displayDocument) return;
    if (!canUseSourceFiles()) return;

    setExportLoading(true);
    try {
      const processedDocuments =
        documentManipulationService.applyDOMChangesToDocument(
          displayDocument,
          displayDocument,
          splitPositions,
        );

      const normalizedDocuments =
        normalizeProcessedDocuments(processedDocuments);

      if (
        (Array.isArray(normalizedDocuments) &&
          normalizedDocuments.length === 0) ||
        (!Array.isArray(normalizedDocuments) &&
          normalizedDocuments.pages.length === 0)
      ) {
        console.warn(
          "Apply changes skipped: no concrete pages available after filtering placeholders.",
        );
        setExportLoading(false);
        return;
      }

      const sourceFiles = getSourceFiles();
      const exportFilename = getExportFilename();
      const files = await exportProcessedDocumentsToFiles(
        normalizedDocuments,
        sourceFiles,
        exportFilename,
      );
      if (!canUseSourceFiles()) {
        setExportLoading(false);
        return;
      }

      // Add "_multitool" suffix to filenames
      const renamedFiles = files.map((file) => {
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

      // Clear all cached page state to prevent stale data from being merged
      clearPersistedDocument();
      updateCurrentPages(null);

      // Deselect old files immediately so the view can reset before we mutate the file list
      actions.setSelectedFiles([]);

      // Remove the original files before inserting the newly generated versions
      if (sourceFileIds.length > 0) {
        await actions.removeFiles(sourceFileIds, true);
      }

      const newStirlingFiles = await actions.addFiles(renamedFiles, {
        selectFiles: true,
        skipUploadTracking: true,
      });
      if (newStirlingFiles.length > 0) {
        actions.setSelectedFiles(newStirlingFiles.map((file) => file.fileId));
      }

      if (sourceFileIds.length === 1 && newStirlingFiles.length === 1) {
        const sourceStub = selectors.getStirlingFileStub(sourceFileIds[0]);
        if (sourceStub?.localFilePath) {
          actions.updateStirlingFileStub(newStirlingFiles[0].fileId, {
            localFilePath: sourceStub.localFilePath,
            isDirty: true,
          });
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
    clearPersistedDocument,
    updateCurrentPages,
    canUseSourceFiles,
  ]);

  return {
    exportLoading,
    onExportSelected,
    onExportAll,
    applyChanges,
  };
};

export type UsePageEditorExportReturn = ReturnType<typeof usePageEditorExport>;
