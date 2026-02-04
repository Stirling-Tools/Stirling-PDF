import { useCallback } from "react";

import {
  BulkRotateCommand,
  DeletePagesCommand,
  PageBreakCommand,
  ReorderPagesCommand,
  SplitCommand,
} from "@app/components/pageEditor/commands/pageCommands";
import type {
  useFileActions,
  useFileState,
} from "@app/contexts/FileContext";
import { PDFDocument, PDFPage } from "@app/types/pageEditor";
import { FileId } from "@app/types/file";
import { StirlingFileStub } from "@app/types/fileContext";

type FileActions = ReturnType<typeof useFileActions>["actions"];
type FileSelectors = ReturnType<typeof useFileState>["selectors"];

interface UsePageEditorCommandsParams {
  displayDocument: PDFDocument | null;
  getEditedDocument: () => PDFDocument | null;
  setEditedDocument: React.Dispatch<React.SetStateAction<PDFDocument | null>>;
  splitPositions: Set<string>;
  setSplitPositions: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedPageIds: string[];
  setSelectedPageIds: (ids: string[]) => void;
  getPageNumbersFromIds: (pageIds: string[]) => number[];
  executeCommandWithTracking: (command: any) => void;
  updateFileOrderFromPages: (pages: PDFPage[]) => void;
  actions: FileActions;
  selectors: FileSelectors;
  setSelectionMode: (enabled: boolean) => void;
  clearUndoHistory: () => void;
}

export const usePageEditorCommands = ({
  displayDocument,
  getEditedDocument,
  setEditedDocument,
  splitPositions,
  setSplitPositions,
  selectedPageIds,
  setSelectedPageIds,
  getPageNumbersFromIds,
  executeCommandWithTracking,
  updateFileOrderFromPages,
  actions,
  selectors,
  setSelectionMode,
  clearUndoHistory,
}: UsePageEditorCommandsParams) => {
  const closePdf = useCallback(() => {
    actions.clearAllFiles();
    clearUndoHistory();
    setSelectedPageIds([]);
    setSelectionMode(false);
  }, [actions, clearUndoHistory, setSelectedPageIds, setSelectionMode]);

  const handleRotatePages = useCallback(
    (pageIds: string[], rotation: number) => {
      const bulkRotateCommand = new BulkRotateCommand(pageIds, rotation);
      executeCommandWithTracking(bulkRotateCommand);
    },
    [executeCommandWithTracking]
  );

  const createRotateCommand = useCallback(
    (pageIds: string[], rotation: number) => ({
      execute: () => {
        const bulkRotateCommand = new BulkRotateCommand(pageIds, rotation);
        executeCommandWithTracking(bulkRotateCommand);
      },
    }),
    [executeCommandWithTracking]
  );

  const createDeleteCommand = useCallback(
    (pageIds: string[]) => ({
      execute: () => {
        const currentDocument = getEditedDocument();
        if (!currentDocument) return;

        const pagesToDelete = pageIds
          .map((pageId) => {
            const page = currentDocument.pages.find((p) => p.id === pageId);
            return page?.pageNumber || 0;
          })
          .filter((num) => num > 0);

        if (pagesToDelete.length > 0) {
          const deleteCommand = new DeletePagesCommand(
            pagesToDelete,
            getEditedDocument,
            setEditedDocument,
            setSelectedPageIds,
            () => splitPositions,
            setSplitPositions,
            () => getPageNumbersFromIds(selectedPageIds),
            () => closePdf()
          );
          executeCommandWithTracking(deleteCommand);
        }
      },
    }),
    [
      closePdf,
      executeCommandWithTracking,
      getEditedDocument,
      getPageNumbersFromIds,
      selectedPageIds,
      setEditedDocument,
      setSelectedPageIds,
      setSplitPositions,
      splitPositions,
    ]
  );

  const createSplitCommand = useCallback(
    (pageId: string, pageNumber: number) => ({
      execute: () => {
        const splitCommand = new SplitCommand(
          pageId,
          pageNumber,
          () => splitPositions,
          setSplitPositions
        );
        executeCommandWithTracking(splitCommand);
      },
    }),
    [splitPositions, executeCommandWithTracking, setSplitPositions]
  );

  const executeCommand = useCallback((command: any) => {
    if (command && typeof command.execute === "function") {
      command.execute();
    }
  }, []);

  const handleRotate = useCallback(
    (direction: "left" | "right") => {
      if (!displayDocument || selectedPageIds.length === 0) return;
      const rotation = direction === "left" ? -90 : 90;

      handleRotatePages(selectedPageIds, rotation);
    },
    [displayDocument, selectedPageIds, handleRotatePages]
  );

  const handleDelete = useCallback(() => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    const selectedPageNumbers = getPageNumbersFromIds(selectedPageIds);

    const deleteCommand = new DeletePagesCommand(
      selectedPageNumbers,
      getEditedDocument,
      setEditedDocument,
      setSelectedPageIds,
      () => splitPositions,
      setSplitPositions,
      () => selectedPageNumbers,
      () => closePdf()
    );
    executeCommandWithTracking(deleteCommand);
  }, [
    closePdf,
    displayDocument,
    executeCommandWithTracking,
    getEditedDocument,
    getPageNumbersFromIds,
    selectedPageIds,
    setEditedDocument,
    setSelectedPageIds,
    setSplitPositions,
    splitPositions,
  ]);

  const handleDeletePage = useCallback(
    (pageNumber: number) => {
      if (!displayDocument) return;

      const deleteCommand = new DeletePagesCommand(
        [pageNumber],
        getEditedDocument,
        setEditedDocument,
        setSelectedPageIds,
        () => splitPositions,
        setSplitPositions,
        () => getPageNumbersFromIds(selectedPageIds),
        () => closePdf()
      );
      executeCommandWithTracking(deleteCommand);
    },
    [
      closePdf,
      getEditedDocument,
      executeCommandWithTracking,
      getPageNumbersFromIds,
      selectedPageIds,
      setEditedDocument,
      setSelectedPageIds,
      setSplitPositions,
      splitPositions,
    ]
  );

  const handleSplit = useCallback(() => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    const selectedSplitPageIds = displayDocument.pages
      .filter((page, index) =>
        selectedPageIds.includes(page.id) && index < displayDocument.pages.length - 1
      )
      .map((page) => page.id);

    if (selectedSplitPageIds.length === 0) return;

    const existingSplitsCount = selectedSplitPageIds.filter((id) =>
      splitPositions.has(id)
    ).length;
    const noSplitsCount = selectedSplitPageIds.length - existingSplitsCount;
    const shouldRemoveSplits = existingSplitsCount > noSplitsCount;

    const newSplitPositions = new Set(splitPositions);

    if (shouldRemoveSplits) {
      selectedSplitPageIds.forEach((id) => newSplitPositions.delete(id));
    } else {
      selectedSplitPageIds.forEach((id) => newSplitPositions.add(id));
    }

    const smartSplitCommand = {
      execute: () => setSplitPositions(newSplitPositions),
      undo: () => setSplitPositions(splitPositions),
      description: shouldRemoveSplits
        ? `Remove ${selectedSplitPageIds.length} split(s)`
        : `Add ${selectedSplitPageIds.length - existingSplitsCount} split(s)`,
    };

    executeCommandWithTracking(smartSplitCommand);
  }, [
    selectedPageIds,
    displayDocument,
    splitPositions,
    setSplitPositions,
    getPageNumbersFromIds,
    executeCommandWithTracking,
  ]);

  const handleSplitAll = handleSplit;

  const handlePageBreak = useCallback(() => {
    if (!displayDocument || selectedPageIds.length === 0) return;

    const selectedPageNumbers = getPageNumbersFromIds(selectedPageIds);

    const pageBreakCommand = new PageBreakCommand(
      selectedPageNumbers,
      getEditedDocument,
      setEditedDocument
    );
    executeCommandWithTracking(pageBreakCommand);
  }, [
    displayDocument,
    executeCommandWithTracking,
    getEditedDocument,
    getPageNumbersFromIds,
    selectedPageIds,
    setEditedDocument,
  ]);

  const handlePageBreakAll = handlePageBreak;

  const handleInsertFiles = useCallback(
    async (
      files: File[] | StirlingFileStub[],
      insertAfterPage: number,
      isFromStorage?: boolean
    ) => {
      console.log('[PageEditor] handleInsertFiles called:', {
        fileCount: files.length,
        insertAfterPage,
        isFromStorage,
      });

      const workingDocument = getEditedDocument();
      if (!workingDocument || files.length === 0) {
        console.log('[PageEditor] handleInsertFiles early return:', {
          hasDocument: !!workingDocument,
          fileCount: files.length,
        });
        return;
      }

      try {
        const targetPage = workingDocument.pages.find(
          (p) => p.pageNumber === insertAfterPage
        );
        if (!targetPage) {
          console.log('[PageEditor] Target page not found:', insertAfterPage);
          return;
        }

        const insertAfterPageId = targetPage.id;
        console.log('[PageEditor] Inserting files after page:', {
          pageNumber: insertAfterPage,
          pageId: insertAfterPageId,
        });

        let addedFileIds: FileId[] = [];
        if (isFromStorage) {
          const stubs = files as StirlingFileStub[];
          const result = await actions.addStirlingFileStubs(stubs, {
            selectFiles: true,
            insertAfterPageId,
          });
          addedFileIds = result.map((file) => file.fileId);
        } else {
          const result = await actions.addFiles(files as File[], {
            selectFiles: true,
            insertAfterPageId,
          });
          addedFileIds = result.map((file) => file.fileId);
          console.log('[PageEditor] Files added to context:', {
            addedCount: addedFileIds.length,
            fileIds: addedFileIds,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 100));

        const newPages: PDFPage[] = [];
        for (const fileId of addedFileIds) {
          const stub = selectors.getStirlingFileStub(fileId);
          if (stub?.processedFile?.pages) {
            const clonedPages = stub.processedFile.pages.map((page, idx) => ({
              ...page,
              id: `${fileId}-${page.pageNumber ?? idx + 1}`,
              pageNumber: page.pageNumber ?? idx + 1,
              originalFileId: fileId,
              originalPageNumber:
                page.originalPageNumber ?? page.pageNumber ?? idx + 1,
              rotation: page.rotation ?? 0,
              thumbnail: page.thumbnail ?? null,
              selected: false,
              splitAfter: page.splitAfter ?? false,
            }));
            newPages.push(...clonedPages);
          }
        }

        if (newPages.length > 0) {
          const targetIndex = workingDocument.pages.findIndex(
            (p) => p.id === targetPage.id
          );

          if (targetIndex >= 0) {
            const updatedPages = [...workingDocument.pages];
            updatedPages.splice(targetIndex + 1, 0, ...newPages);

            updatedPages.forEach((page, index) => {
              page.pageNumber = index + 1;
            });

            setEditedDocument({
              ...workingDocument,
              pages: updatedPages,
            });

            updateFileOrderFromPages(updatedPages);
          }
        }
      } catch (error) {
        console.error("Failed to insert files:", error);
      }
    },
    [
      getEditedDocument,
      actions,
      selectors,
      updateFileOrderFromPages,
      setEditedDocument,
    ]
  );

  const handleReorderPages = useCallback(
    (
      sourcePageNumber: number,
      targetIndex: number,
      draggedPageIds?: string[]
    ) => {
      if (!displayDocument) return;

      const selectedPages = draggedPageIds
        ? getPageNumbersFromIds(draggedPageIds)
        : undefined;

      const reorderCommand = new ReorderPagesCommand(
        sourcePageNumber,
        targetIndex,
        selectedPages,
        getEditedDocument,
        setEditedDocument,
        (newPages) => updateFileOrderFromPages(newPages)
      );
      executeCommandWithTracking(reorderCommand);
    },
    [
      displayDocument,
      getEditedDocument,
      executeCommandWithTracking,
      getPageNumbersFromIds,
      setEditedDocument,
      updateFileOrderFromPages,
    ]
  );

  return {
    createRotateCommand,
    createDeleteCommand,
    createSplitCommand,
    executeCommand,
    handleRotate,
    handleDelete,
    handleDeletePage,
    handleSplit,
    handleSplitAll,
    handlePageBreak,
    handlePageBreakAll,
    handleInsertFiles,
    handleReorderPages,
    closePdf,
  };
};

export type UsePageEditorCommandsReturn = ReturnType<
  typeof usePageEditorCommands
>;
