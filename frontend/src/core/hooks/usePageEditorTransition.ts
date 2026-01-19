import { useCallback } from 'react';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { useFileState } from '@app/contexts/FileContext';
import { getContainedImageRect, getCenteredFallbackRect } from '@app/utils/dom';
import type { WorkbenchType } from '@app/types/workbench';
import type { FileId } from '@app/types/fileContext';

interface UsePageEditorTransitionParams {
  currentView: WorkbenchType;
  captureScreenshot: () => Promise<string | null>;
  activeFileId?: FileId;
}

interface PageEditorTransitionHandlers {
  handleEntryTransition: (options?: { sourceRect?: DOMRect; sourceFileId?: FileId }) => Promise<void>;
  handleExitTransition: () => void;
}

/**
 * Custom hook to handle page editor entry and exit spreading transitions
 * Captures file card positions and orchestrates the spreading animation
 */
export function usePageEditorTransition({
  currentView,
  captureScreenshot,
  activeFileId,
}: UsePageEditorTransitionParams): PageEditorTransitionHandlers {
  const { actions: navActions } = useNavigationActions();
  const { selectors } = useFileState();

  const decodeImage = useCallback(async (src: string) => {
    if (!src) return;
    try {
      const img = new Image();
      img.src = src;
      if ('decode' in img) {
        await img.decode();
      } else {
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      }
    } catch {
      // Ignore decode failures; fallback is rendering with normal load.
    }
  }, []);

  /**
   * Handle entry transition (fileEditor → pageEditor)
   * Captures first page position and metadata for glide-then-burst animation
   */
  const handleEntryTransition = useCallback(
    async (options) => {
      if (currentView !== 'fileEditor' && currentView !== 'viewer') {
        return;
      }

      const fileCardRects = new Map<string, DOMRect>();
      const filePageCounts = new Map<string, number>();
      const pageThumbnails = new Map<string, string>(); // Map file ID to first page thumbnail URL

      // Get active files to capture their first page positions
      const activeFiles = selectors.getFiles();
      let cumulativePageIndex = 0;

      const sourceFileId = options?.sourceFileId ?? activeFileId ?? undefined;
      let sourceRect = options?.sourceRect ?? null;
      if (currentView === 'viewer' && sourceFileId && !sourceRect) {
        const pageElement = document.querySelector('[data-page-index="0"]') as HTMLElement | null;
        sourceRect = pageElement ? pageElement.getBoundingClientRect() : getCenteredFallbackRect();
      }

      activeFiles.forEach((file) => {
        const fileId = file.fileId;

        if (currentView === 'fileEditor') {
          const card = document.querySelector(`[data-file-id="${fileId}"]`) as HTMLElement | null;
          if (card) {
            const img = card.querySelector('img') as HTMLImageElement | null;
            const rect = img
              ? getContainedImageRect(img)
              : card.getBoundingClientRect();
            fileCardRects.set(fileId, rect);
          }
        } else if (currentView === 'viewer' && sourceFileId && sourceRect && fileId === sourceFileId) {
          fileCardRects.set(fileId, sourceRect);
        }

        // Get page data from file metadata
        const stub = selectors.getStirlingFileStub(fileId);
        const pageCount = stub?.processedFile?.totalPages || 1;
        const pages = stub?.processedFile?.pages || [];

        filePageCounts.set(fileId, pageCount);

        // Capture only the first page thumbnail to keep transition state light
        const firstThumbnail = pages[0]?.thumbnail;
        if (firstThumbnail) {
          pageThumbnails.set(fileId, firstThumbnail);
        }

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

      if (screenshot) {
        await decodeImage(screenshot);
      }

      if (sourceFileId) {
        const sourceStub = selectors.getStirlingFileStub(sourceFileId);
        const firstThumb = sourceStub?.processedFile?.pages?.[0]?.thumbnail;
        if (firstThumb) {
          await decodeImage(firstThumb);
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
    [currentView, selectors, captureScreenshot, navActions, activeFileId, decodeImage]
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
