import { useCallback } from 'react';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { useFileState } from '@app/contexts/FileContext';
import { getContainedImageRect } from '@app/utils/dom';
import type { WorkbenchType } from '@app/types/workbench';
import type { FileId } from '@app/types/fileContext';

interface UsePageEditorTransitionParams {
  currentView: WorkbenchType;
  captureScreenshot: () => Promise<string | null>;
}

interface PageEditorTransitionHandlers {
  handleEntryTransition: () => Promise<void>;
  handleExitTransition: () => void;
}

/**
 * Custom hook to handle page editor entry and exit spreading transitions
 * Captures file card positions and orchestrates the spreading animation
 */
export function usePageEditorTransition({
  currentView,
  captureScreenshot,
}: UsePageEditorTransitionParams): PageEditorTransitionHandlers {
  const { actions: navActions } = useNavigationActions();
  const { selectors } = useFileState();

  /**
   * Handle entry transition (fileEditor → pageEditor)
   * Captures first page position and metadata for glide-then-burst animation
   */
  const handleEntryTransition = useCallback(
    async () => {
      if (currentView !== 'fileEditor') {
        return;
      }

      const fileCardRects = new Map<string, DOMRect>();
      const filePageCounts = new Map<string, number>();
      const pageThumbnails = new Map<number, string>(); // Map page index to thumbnail URL

      // Get active files to capture their first page positions
      const activeFiles = selectors.getFiles();

      // Query all file cards in FileEditor
      const cards = document.querySelectorAll('[data-file-id]');

      let cumulativePageIndex = 0;

      cards.forEach((card) => {
        const fileId = card.getAttribute('data-file-id');
        if (!fileId) return;

        // Get image rect (this represents the first page thumbnail)
        const img = card.querySelector('img') as HTMLImageElement | null;
        const rect = img
          ? getContainedImageRect(img)
          : card.getBoundingClientRect();

        fileCardRects.set(fileId, rect);

        // Get page data from file metadata
        const stub = selectors.getStirlingFileStub(fileId);
        const pageCount = stub?.processedFile?.totalPages || 1;
        const pages = stub?.processedFile?.pages || [];

        filePageCounts.set(fileId, pageCount);

        // Capture individual page thumbnails
        pages.forEach((page, index) => {
          if (page.thumbnail) {
            pageThumbnails.set(cumulativePageIndex + index, page.thumbnail);
          }
        });

        cumulativePageIndex += pageCount;
      });

      // Only proceed if we have at least one file card
      if (fileCardRects.size === 0) {
        return;
      }

      // Optional: capture screenshot for static background
      let screenshot: string | null = null;
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!prefersReducedMotion) {
        try {
          screenshot = await captureScreenshot();
        } catch {
          screenshot = null;
        }
      }

      // Start page editor entry transition with first page glide
      navActions.startPageEditorEntryTransition({
        isAnimating: true,
        direction: 'enter',
        fileCardRects,
        filePageCounts,
        pageThumbnails,
        targetPageRects: null, // Will be set after PageEditor renders
        editorScreenshotUrl: screenshot,
      });
    },
    [currentView, selectors, captureScreenshot, navActions]
  );

  /**
   * Handle exit transition (pageEditor → fileEditor)
   * Captures current page positions in grid for reverse animation
   */
  const handleExitTransition = useCallback(() => {
    if (currentView !== 'pageEditor') {
      return;
    }

    const targetPageRects = new Map<string, DOMRect>();
    const fileCardRects = new Map<string, DOMRect>();
    const filePageCounts = new Map<string, number>();

    // Query all page thumbnails (by data-page-id attribute)
    const pages = document.querySelectorAll('[data-page-id]');

    pages.forEach((page) => {
      const pageId = page.getAttribute('data-page-id');
      const originalFileId = page.getAttribute('data-original-file-id');
      if (!pageId) return;

      const img = page.querySelector('img') as HTMLImageElement | null;
      const rect = img
        ? getContainedImageRect(img)
        : page.getBoundingClientRect();

      targetPageRects.set(pageId, rect);

      // Track which files have pages (for grouping in reverse animation)
      if (originalFileId) {
        if (!filePageCounts.has(originalFileId)) {
          filePageCounts.set(originalFileId, 0);
        }
        filePageCounts.set(originalFileId, filePageCounts.get(originalFileId)! + 1);
      }
    });

    // Only proceed if we have pages
    if (targetPageRects.size === 0) {
      return;
    }

    // Start page editor exit transition
    // File card positions will be calculated after FileEditor renders
    navActions.startPageEditorExitTransition({
      isAnimating: true,
      direction: 'exit',
      targetPageRects, // Current page positions
      fileCardRects, // Will be filled after FileEditor renders
      filePageCounts,
      editorScreenshotUrl: null,
    });
  }, [currentView, navActions]);

  return {
    handleEntryTransition,
    handleExitTransition,
  };
}
