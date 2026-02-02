import { useMemo, useEffect, useRef, useState } from 'react';
import { useFileState } from '@app/contexts/FileContext';
import { usePageEditor } from '@app/contexts/PageEditorContext';
import { PDFDocument, PDFPage } from '@app/types/pageEditor';
import { FileId } from '@app/types/file';
import { FileAnalyzer } from '@app/services/fileAnalyzer';

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
  const { fileOrder, currentPages, persistedDocument, persistedDocumentSignature } = usePageEditor();

  // Use PageEditorContext's fileOrder instead of FileContext's global order
  // This ensures the page editor respects its own workspace ordering
  const allFileIds = fileOrder;

  // Derive selected file IDs directly from FileContext (single source of truth)
  // Filter to only include PDF files (PageEditor only supports PDFs)
  // Use stable string keys to prevent infinite loops
  const allFileIdsKey = allFileIds.join(',');
  const selectedFileIdsKey = [...state.ui.selectedFileIds].sort().join(',');
  const activeFilesSignature = selectors.getFilesSignature();

  // Get ALL PDF files (selected or not) for document building with placeholders
  const activeFileIds = useMemo(() => {
    return allFileIds.filter(id => {
      const stub = selectors.getStirlingFileStub(id);
      return stub?.name?.toLowerCase().endsWith('.pdf') ?? false;
    });
  }, [allFileIdsKey, activeFilesSignature, selectors]);

  const selectedActiveFileIds = useMemo(() => {
    if (activeFileIds.length === 0) {
      return [];
    }
    const selectedSet = new Set(state.ui.selectedFileIds);
    if (selectedSet.size === 0) {
      return [];
    }
    return activeFileIds.filter((id) => selectedSet.has(id));
  }, [activeFileIds, selectedFileIdsKey]);

  const primaryFileId = selectedActiveFileIds[0] ?? activeFileIds[0] ?? null;

  // UI state
  const globalProcessing = state.ui.isProcessing;

  // Get primary file record outside useMemo to track processedFile changes
  const primaryStirlingFileStub = primaryFileId ? selectors.getStirlingFileStub(primaryFileId) : null;
  const processedFilePages = primaryStirlingFileStub?.processedFile?.pages;
  const processedFileTotalPages = primaryStirlingFileStub?.processedFile?.totalPages;

  const placeholderDocumentRef = useRef<PDFDocument | null>(null);
  const [placeholderVersion, setPlaceholderVersion] = useState(0);

  useEffect(() => {
    if (!primaryFileId) {
      placeholderDocumentRef.current = null;
      setPlaceholderVersion(v => v + 1);
      return;
    }

    if (primaryStirlingFileStub?.processedFile) {
      placeholderDocumentRef.current = null;
      setPlaceholderVersion(v => v + 1);
      return;
    }

    const file = selectors.getFile(primaryFileId);
    if (!file) {
      placeholderDocumentRef.current = null;
      setPlaceholderVersion(v => v + 1);
      return;
    }

    let canceled = false;

    const loadPlaceholder = async () => {
      try {
        const analysis = await FileAnalyzer.quickPDFAnalysis(file);
        if (canceled) return;
        const totalPages = Math.max(1, analysis.pageCount || 1);
        const pages: PDFPage[] = Array.from({ length: totalPages }, (_, index) => ({
          id: `placeholder-${primaryFileId}-page-${index + 1}`,
          pageNumber: index + 1,
          thumbnail: null,
          rotation: 0,
          selected: false,
          originalFileId: primaryFileId,
          originalPageNumber: index + 1,
        }));

        if (!canceled) {
          placeholderDocumentRef.current = {
            id: `placeholder-${primaryFileId}`,
            name: selectors.getStirlingFileStub(primaryFileId)?.name ?? file.name,
            file,
            pages,
            totalPages,
          };
          setPlaceholderVersion(v => v + 1);
        }
      } catch {
        if (!canceled) {
          placeholderDocumentRef.current = null;
          setPlaceholderVersion(v => v + 1);
        }
      }
    };

    loadPlaceholder();

    return () => {
      canceled = true;
    };
  }, [primaryFileId, primaryStirlingFileStub?.processedFile, selectors]);

  // Compute merged document with stable signature (prevents infinite loops)
  const currentPagesSignature = useMemo(() => {
    return currentPages ? currentPages.map(page => page.id).join(',') : '';
  }, [currentPages]);

  const mergedPdfDocument = useMemo((): PDFDocument | null => {
    console.log('[usePageDocument] Building document:', {
      activeFileIds: activeFileIds.length,
      selectedActiveFileIds: selectedActiveFileIds.length,
      hasPersistedDoc: !!persistedDocument,
      persistedDocPages: persistedDocument?.pages.length,
      persistedSig: persistedDocumentSignature?.substring(0, 50),
      currentSig: currentPagesSignature.substring(0, 50),
    });

    if (activeFileIds.length === 0) {
      console.log('[usePageDocument] No active files, returning null');
      return null;
    }

  // Check if persisted document is still valid
  // Must match signature AND have the same number of source files
  const persistedFileIds = persistedDocument
    ? Array.from(new Set(persistedDocument.pages.map(p => p.originalFileId).filter(Boolean)))
    : [];
  const persistedIsValid =
    persistedDocument &&
    persistedDocumentSignature &&
    persistedDocumentSignature === currentPagesSignature &&
    currentPagesSignature.length > 0 &&
    persistedFileIds.length === activeFileIds.length; // Ensure file count matches

  if (persistedIsValid) {
    console.log('[usePageDocument] Using persisted document');
    return persistedDocument;
  } else if (persistedDocument) {
    console.log('[usePageDocument] Persisted document invalid - rebuilding:', {
      sigMatch: persistedDocumentSignature === currentPagesSignature,
      persistedFiles: persistedFileIds.length,
      activeFiles: activeFileIds.length,
    });
  }

  if (!primaryStirlingFileStub?.processedFile && placeholderDocumentRef.current) {
    return placeholderDocumentRef.current;
  }

  const primaryFile = primaryFileId ? selectors.getFile(primaryFileId) : null;

    // If we have file IDs but no file record, something is wrong - return null to show loading
    if (!primaryStirlingFileStub) {
      console.log('🎬 PageEditor: No primary file record found, showing loading');
      return null;
    }

    const namingFileIds = selectedActiveFileIds.length > 0 ? selectedActiveFileIds : activeFileIds;

    const name =
      namingFileIds.length <= 1
        ? (namingFileIds[0]
            ? selectors.getStirlingFileStub(namingFileIds[0])?.name ?? 'document.pdf'
            : 'document.pdf')
        : namingFileIds
            .map(id => (selectors.getStirlingFileStub(id)?.name ?? 'file').replace(/\.pdf$/i, ''))
            .join(' + ');

    // Build page insertion map from files with insertion positions
    const insertionMap = new Map<string, FileId[]>(); // insertAfterPageId -> fileIds
    const originalFileIds: FileId[] = [];

    activeFileIds.forEach(fileId => {
      const record = selectors.getStirlingFileStub(fileId);
      if (record?.insertAfterPageId !== undefined) {
        console.log('[usePageDocument] File has insertAfterPageId:', {
          fileId,
          insertAfterPageId: record.insertAfterPageId,
        });
        if (!insertionMap.has(record.insertAfterPageId)) {
          insertionMap.set(record.insertAfterPageId, []);
        }
        insertionMap.get(record.insertAfterPageId)!.push(fileId);
      } else {
        originalFileIds.push(fileId);
      }
    });

    console.log('[usePageDocument] File categorization:', {
      originalFiles: originalFileIds.length,
      filesToInsert: insertionMap.size,
      totalActive: activeFileIds.length,
    });

    // Build pages by interleaving original pages with insertions
    let pages: PDFPage[] = [];

    // Helper function to create pages from a file (or placeholder if deselected)
    const createPagesFromFile = (fileId: FileId, startPageNumber: number, isSelected: boolean): PDFPage[] => {
      const stirlingFileStub = selectors.getStirlingFileStub(fileId);
      if (!stirlingFileStub) {
        return [];
      }

      // If file is deselected, create a single placeholder page
      if (!isSelected) {
        return [{
          id: `${fileId}-placeholder`,
          pageNumber: startPageNumber,
          originalPageNumber: 1,
          originalFileId: fileId,
          rotation: 0,
          thumbnail: null,
          selected: false,
          splitAfter: false,
          isPlaceholder: true,
        }];
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
          isPlaceholder: false,
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
          isPlaceholder: false,
        }));
      } else {
        // No processedFile yet - create a single loading placeholder
        // This will be replaced when processing completes
        filePages = [{
          id: `${fileId}-loading`,
          pageNumber: startPageNumber,
          originalPageNumber: 1,
          originalFileId: fileId,
          rotation: 0,
          thumbnail: null,
          selected: false,
          splitAfter: false,
          isPlaceholder: true,
        }];
      }

      return filePages;
    };

    // Collect all pages from original files, respecting their previous positions
    const selectedFileIdsSet = new Set(state.ui.selectedFileIds);

    // Sort original files by their position in fileOrder (so placeholders stay in correct spot)
    // Use fileOrder as source of truth since it persists across page editor sessions
    const fileOrderMap = new Map(allFileIds.map((id, index) => [id, index]));

    const sortedOriginalFileIds = [...originalFileIds].sort((a, b) => {
      const posA = fileOrderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
      const posB = fileOrderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
      return posA - posB;
    });

    const originalFilePages: PDFPage[] = [];
    sortedOriginalFileIds.forEach(fileId => {
      const isSelected = selectedFileIdsSet.has(fileId);
      const filePages = createPagesFromFile(fileId, 1, isSelected); // Temporary numbering
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
        const isSelected = selectedFileIdsSet.has(fileId);
        const insertedPages = createPagesFromFile(fileId, 1, isSelected);
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

    // Pages are already in the correct order from the sorted assembly above
    // Just ensure page numbers are sequential
    pages = pages.map((page, index) => ({
      ...page,
      pageNumber: index + 1,
    }));

    const currentPagesSet = currentPages ? new Set(currentPages.map(page => page.id)) : null;
    if (currentPagesSet && currentPages && currentPagesSet.size === pages.length) {
      const sameIds = pages.every(page => currentPagesSet.has(page.id));
      if (sameIds) {
        const mergedById = new Map(pages.map(page => [page.id, page]));
        pages = currentPages.map((currentPage, index) => {
          const source = mergedById.get(currentPage.id);
          const mergedPage = source ? { ...source, ...currentPage } : currentPage;
          return {
            ...mergedPage,
            pageNumber: index + 1,
          };
        });
      }
    }

    const mergedDoc: PDFDocument = {
      id: activeFileIds.join('-'),
      name,
      file: primaryFile!,
      pages,
      totalPages: pages.length,
    };

    return mergedDoc;
  }, [
    activeFileIds,
    selectedActiveFileIds,
    primaryFileId,
    primaryStirlingFileStub,
    processedFilePages,
    processedFileTotalPages,
    selectors,
    activeFilesSignature,
    selectedFileIdsKey,
    state.ui.selectedFileIds,
    state.files.byId, // Force recompute when any file stub changes (including processedFile updates)
    allFileIds,
    currentPagesSignature,
    currentPages,
    persistedDocument,
    persistedDocumentSignature,
    placeholderVersion,
  ]);

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
