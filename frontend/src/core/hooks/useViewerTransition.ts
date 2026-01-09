import { useCallback } from 'react';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { useFileState } from '@app/contexts/FileContext';
import { getThumbnailRect, getCenteredFallbackRect } from '@app/utils/dom';
import type { WorkbenchType } from '@app/types/workbench';
import type { FileId } from '@app/types/fileContext';

interface UseViewerTransitionParams {
  activeFileIndex: number;
  currentView: WorkbenchType;
  captureScreenshot: () => Promise<string | null>;
}

interface ViewerTransitionHandlers {
  handleEntryTransition: (fileId?: FileId, sourceRect?: DOMRect) => Promise<void>;
  handleExitTransition: () => void;
}

/**
 * Custom hook to handle viewer entry and exit transitions
 * Extracts transition orchestration logic from Workbench component
 */
export function useViewerTransition({
  activeFileIndex,
  currentView,
  captureScreenshot,
}: UseViewerTransitionParams): ViewerTransitionHandlers {
  const { actions: navActions } = useNavigationActions();
  const { selectors } = useFileState();
  const getActiveFile = () => selectors.getFiles()[activeFileIndex];

  /**
   * Handle entry transition (fileEditor/pageEditor → viewer)
   * Captures screenshot, finds source thumbnail, starts zoom animation
   */
  const handleEntryTransition = useCallback(
    async (fileId?: FileId, sourceRect?: DOMRect) => {
      if (currentView !== 'fileEditor' && currentView !== 'pageEditor') {
        return;
      }

      let screenshot: string | null = null;
      try {
        screenshot = await captureScreenshot();
      } catch {
        screenshot = null;
      }

      // Use passed fileId to find the file directly
      let targetFileId = fileId;
      if (!targetFileId) {
        // Fallback to activeFile if no fileId passed
        const activeFile = getActiveFile();
        targetFileId = activeFile?.fileId;
      }

      if (!targetFileId) {
        return; // Can't animate without knowing which file
      }

      // Find file stub directly by ID (no state dependency)
      const activeStub = selectors.getStirlingFileStub(targetFileId);
      const thumbnailUrl = activeStub?.thumbnailUrl || '';

      if (!thumbnailUrl) {
        return; // Can't animate without thumbnail
      }

      // Use passed sourceRect if available, otherwise search DOM
      let rect = sourceRect;
      if (!rect) {
        const fileCard = document.querySelector(`[data-file-id="${targetFileId}"]`) as HTMLElement | null;
        rect = fileCard ? getThumbnailRect(fileCard) : getCenteredFallbackRect();
      }

      navActions.startViewerTransition(
        rect,
        thumbnailUrl,
        currentView,
        screenshot || undefined
      );
    },
    [currentView, activeFileIndex, selectors, captureScreenshot, navActions]
  );

  /**
   * Handle exit transition (viewer → fileEditor/pageEditor)
   * Finds PDF page position, finds target thumbnail, starts reverse zoom animation
   */
  const handleExitTransition = useCallback(
    () => {
      if (currentView !== 'viewer') {
        return;
      }

      const activeFile = getActiveFile();
      const activeStub = activeFile ? selectors.getStirlingFileStub(activeFile.fileId) : null;
      const thumbnailUrl = activeStub?.thumbnailUrl || '';

      if (activeFile && thumbnailUrl) {
        // Find current PDF page position (still in DOM)
        const pdfPageElement = document.querySelector('[data-page-index="0"]');

        const exitTargetRect = pdfPageElement
          ? pdfPageElement.getBoundingClientRect()
          : getCenteredFallbackRect();

        // Start exit transition - file card position will be found after fileEditor renders
        navActions.startExitTransition(exitTargetRect, thumbnailUrl, activeFile.fileId);
      }
    },
    [currentView, activeFileIndex, selectors, navActions]
  );

  return {
    handleEntryTransition,
    handleExitTransition,
  };
}
