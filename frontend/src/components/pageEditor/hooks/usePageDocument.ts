import { useMemo } from 'react';
import { useFileState } from '../../../contexts/FileContext';
import { PDFDocument, PDFPage } from '../../../types/pageEditor';
import { FileId } from '../../../types/file';

export interface PageDocumentHook {
  document: PDFDocument | null;
  isVeryLargeDocument: boolean;
  isLoading: boolean;
}

/**
 * Hook for managing PDF document state and metadata in PageEditor
 * Handles document merging, large document detection, and loading states
 */
export function usePageDocument(): PageDocumentHook {
  const { state, selectors } = useFileState();

  // Convert Set to array and filter to maintain file order from FileContext
  const allFileIds = state.files.ids;

  // Derive selected file IDs directly from FileContext (single source of truth)
  // Filter to only include PDF files (PageEditor only supports PDFs)
  // Use stable string keys to prevent infinite loops
  const allFileIdsKey = allFileIds.join(',');
  const selectedIdsKey = [...state.ui.selectedFileIds].sort().join(',');
  const filesSignature = selectors.getFilesSignature();

  const activeFileIds = useMemo(() => {
    const selectedFileIds = new Set(state.ui.selectedFileIds);
    return allFileIds.filter(id => {
      if (!selectedFileIds.has(id)) return false;
      const stub = selectors.getStirlingFileStub(id);
      return stub?.name?.toLowerCase().endsWith('.pdf') ?? false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFileIdsKey, selectedIdsKey, filesSignature]);

  const primaryFileId = activeFileIds[0] ?? null;

  // UI state
  const globalProcessing = state.ui.isProcessing;

  // Get primary file record outside useMemo to track processedFile changes
  const primaryStirlingFileStub = primaryFileId ? selectors.getStirlingFileStub(primaryFileId) : null;
  const processedFilePages = primaryStirlingFileStub?.processedFile?.pages;
  const processedFileTotalPages = primaryStirlingFileStub?.processedFile?.totalPages;

  // Compute merged document with stable signature (prevents infinite loops)
  const mergedPdfDocument = useMemo((): PDFDocument | null => {
    if (activeFileIds.length === 0) return null;

    const primaryFile = primaryFileId ? selectors.getFile(primaryFileId) : null;

    // If we have file IDs but no file record, something is wrong - return null to show loading
    if (!primaryStirlingFileStub) {
      console.log('🎬 PageEditor: No primary file record found, showing loading');
      return null;
    }

    const name =
      activeFileIds.length === 1
        ? (primaryStirlingFileStub.name ?? 'document.pdf')
        : activeFileIds
            .map(id => (selectors.getStirlingFileStub(id)?.name ?? 'file').replace(/\.pdf$/i, ''))
            .join(' + ');

    // Build page insertion map from files with insertion positions
    const insertionMap = new Map<string, FileId[]>(); // insertAfterPageId -> fileIds
    const originalFileIds: FileId[] = [];

    activeFileIds.forEach(fileId => {
      const record = selectors.getStirlingFileStub(fileId);
      if (record?.insertAfterPageId !== undefined) {
        if (!insertionMap.has(record.insertAfterPageId)) {
          insertionMap.set(record.insertAfterPageId, []);
        }
        insertionMap.get(record.insertAfterPageId)!.push(fileId);
      } else {
        originalFileIds.push(fileId);
      }
    });

    // Build pages by interleaving original pages with insertions
    let pages: PDFPage[] = [];

    // Helper function to create pages from a file
    const createPagesFromFile = (fileId: FileId, startPageNumber: number): PDFPage[] => {
      const stirlingFileStub = selectors.getStirlingFileStub(fileId);
      if (!stirlingFileStub) {
        return [];
      }

      const processedFile = stirlingFileStub.processedFile;
      let filePages: PDFPage[] = [];

      if (processedFile?.pages && processedFile.pages.length > 0) {
        // Use fully processed pages with thumbnails
        filePages = processedFile.pages.map((page, pageIndex) => ({
          id: `${fileId}-${page.pageNumber}`,
          pageNumber: startPageNumber + pageIndex,
          thumbnail: page.thumbnail || null,
          rotation: page.rotation || 0,
          selected: false,
          splitAfter: page.splitAfter || false,
          originalPageNumber: page.originalPageNumber || page.pageNumber || pageIndex + 1,
          originalFileId: fileId,
        }));
      } else if (processedFile?.totalPages) {
        // Fallback: create pages without thumbnails but with correct count
        filePages = Array.from({ length: processedFile.totalPages }, (_, pageIndex) => ({
          id: `${fileId}-${pageIndex + 1}`,
          pageNumber: startPageNumber + pageIndex,
          originalPageNumber: pageIndex + 1,
          originalFileId: fileId,
          rotation: 0,
          thumbnail: null,
          selected: false,
          splitAfter: false,
        }));
      }

      return filePages;
    };

    // Collect all pages from original files (without renumbering yet)
    const originalFilePages: PDFPage[] = [];
    originalFileIds.forEach(fileId => {
      const filePages = createPagesFromFile(fileId, 1); // Temporary numbering
      originalFilePages.push(...filePages);
    });

    // Start with all original pages numbered sequentially
    pages = originalFilePages.map((page, index) => ({
      ...page,
      pageNumber: index + 1
    }));

    // Process each insertion by finding the page ID and inserting after it
    for (const [insertAfterPageId, fileIds] of insertionMap.entries()) {
      const targetPageIndex = pages.findIndex(p => p.id === insertAfterPageId);

      if (targetPageIndex === -1) continue;

      // Collect all pages to insert
      const allNewPages: PDFPage[] = [];
      fileIds.forEach(fileId => {
        const insertedPages = createPagesFromFile(fileId, 1);
        allNewPages.push(...insertedPages);
      });

      // Insert all new pages after the target page
      pages.splice(targetPageIndex + 1, 0, ...allNewPages);

      // Renumber all pages after insertion
      pages.forEach((page, index) => {
        page.pageNumber = index + 1;
      });
    }

    if (pages.length === 0) {
      return null;
    }

    const mergedDoc: PDFDocument = {
      id: activeFileIds.join('-'),
      name,
      file: primaryFile!,
      pages,
      totalPages: pages.length,
    };

    return mergedDoc;
  }, [activeFileIds, primaryFileId, primaryStirlingFileStub, processedFilePages, processedFileTotalPages, selectors, filesSignature]);

  // Large document detection for smart loading
  const isVeryLargeDocument = useMemo(() => {
    return mergedPdfDocument ? mergedPdfDocument.totalPages > 2000 : false;
  }, [mergedPdfDocument?.totalPages]);

  // Loading state
  const isLoading = globalProcessing && !mergedPdfDocument;

  return {
    document: mergedPdfDocument,
    isVeryLargeDocument,
    isLoading
  };
}
