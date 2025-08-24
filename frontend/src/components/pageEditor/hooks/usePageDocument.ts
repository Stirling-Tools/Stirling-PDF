import { useMemo } from 'react';
import { useFileState } from '../../../contexts/FileContext';
import { PDFDocument, PDFPage } from '../../../types/pageEditor';

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
  
  // Prefer IDs + selectors to avoid array identity churn
  const activeFileIds = state.files.ids;
  const primaryFileId = activeFileIds[0] ?? null;
  
  // Stable signature for effects (prevents loops)
  const filesSignature = selectors.getFilesSignature();
  
  // UI state
  const globalProcessing = state.ui.isProcessing;
  
  // Get primary file record outside useMemo to track processedFile changes
  const primaryFileRecord = primaryFileId ? selectors.getFileRecord(primaryFileId) : null;
  const processedFilePages = primaryFileRecord?.processedFile?.pages;
  const processedFileTotalPages = primaryFileRecord?.processedFile?.totalPages;

  // Compute merged document with stable signature (prevents infinite loops)
  const mergedPdfDocument = useMemo((): PDFDocument | null => {
    if (activeFileIds.length === 0) return null;

    const primaryFile = primaryFileId ? selectors.getFile(primaryFileId) : null;
    
    // If we have file IDs but no file record, something is wrong - return null to show loading
    if (!primaryFileRecord) {
      console.log('🎬 PageEditor: No primary file record found, showing loading');
      return null;
    }

    const name =
      activeFileIds.length === 1
        ? (primaryFileRecord.name ?? 'document.pdf')
        : activeFileIds
            .map(id => (selectors.getFileRecord(id)?.name ?? 'file').replace(/\.pdf$/i, ''))
            .join(' + ');

    // Debug logging for merged document creation
    console.log(`🎬 PageEditor: Building merged document for ${name} with ${activeFileIds.length} files`);
    
    // Collect pages from ALL active files, not just the primary file
    let pages: PDFPage[] = [];
    let totalPageCount = 0;
    
    activeFileIds.forEach((fileId, fileIndex) => {
      const fileRecord = selectors.getFileRecord(fileId);
      if (!fileRecord) {
        console.warn(`🎬 PageEditor: No record found for file ${fileId}`);
        return;
      }
      
      const processedFile = fileRecord.processedFile;
      console.log(`🎬 PageEditor: Processing file ${fileIndex + 1}/${activeFileIds.length} (${fileRecord.name})`);
      console.log(`🎬 ProcessedFile exists:`, !!processedFile);
      console.log(`🎬 ProcessedFile pages:`, processedFile?.pages?.length || 0);
      console.log(`🎬 ProcessedFile totalPages:`, processedFile?.totalPages || 'unknown');
      
      let filePages: PDFPage[] = [];
      
      if (processedFile?.pages && processedFile.pages.length > 0) {
        // Use fully processed pages with thumbnails
        filePages = processedFile.pages.map((page, pageIndex) => ({
          id: `${fileId}-${page.pageNumber}`,
          pageNumber: totalPageCount + pageIndex + 1,
          thumbnail: page.thumbnail || null,
          rotation: page.rotation || 0,
          selected: false,
          splitAfter: page.splitAfter || false,
          originalPageNumber: page.originalPageNumber || page.pageNumber || pageIndex + 1,
          originalFileId: fileId,
        }));
      } else if (processedFile?.totalPages) {
        // Fallback: create pages without thumbnails but with correct count
        console.log(`🎬 PageEditor: Creating placeholder pages for ${fileRecord.name} (${processedFile.totalPages} pages)`);
        filePages = Array.from({ length: processedFile.totalPages }, (_, pageIndex) => ({
          id: `${fileId}-${pageIndex + 1}`,
          pageNumber: totalPageCount + pageIndex + 1,
          originalPageNumber: pageIndex + 1,
          originalFileId: fileId,
          rotation: 0,
          thumbnail: null, // Will be generated later
          selected: false,
          splitAfter: false,
        }));
      }
      
      pages = pages.concat(filePages);
      totalPageCount += filePages.length;
    });

    if (pages.length === 0) {
      console.warn('🎬 PageEditor: No pages found in any files');
      return null;
    }

    console.log(`🎬 PageEditor: Created merged document with ${pages.length} total pages`);

    const mergedDoc: PDFDocument = {
      id: activeFileIds.join('-'),
      name,
      file: primaryFile!,
      pages,
      totalPages: pages.length,
    };

    return mergedDoc;
  }, [activeFileIds, primaryFileId, primaryFileRecord, processedFilePages, processedFileTotalPages, selectors, filesSignature]);

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