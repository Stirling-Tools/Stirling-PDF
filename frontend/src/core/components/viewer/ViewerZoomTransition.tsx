import React, { useEffect, useState } from 'react';
import { useNavigationState, useNavigationActions } from '@app/contexts/NavigationContext';
import styles from './ViewerZoomTransition.module.css';

/**
 * ViewerZoomTransition - Animated overlay for smooth transitions to viewer mode
 *
 * Creates a "zoom in" effect from source element (file card or page thumbnail)
 * to the actual rendered PDF page by animating a thumbnail overlay.
 *
 * Coordinates with EmbedPDF initialization to ensure smooth handoff.
 */
export const ViewerZoomTransition: React.FC = () => {
  const { viewerTransition } = useNavigationState();
  const { actions } = useNavigationActions();
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'searching' | 'zooming'>('idle');
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const isExitTransition = viewerTransition.transitionDirection === 'exit';

  useEffect(() => {
    let transitionTimer: number | null = null;
    let isMounted = true;

    if (!viewerTransition.isAnimating) {
      setAnimationPhase('idle');
      setTargetRect(null);
      return () => {
        isMounted = false;
        if (transitionTimer !== null) {
          clearTimeout(transitionTimer);
        }
      };
    }

    if (isExitTransition) {
      // EXIT TRANSITION: Search for file card in fileEditor, then zoom
      setAnimationPhase('searching');

      const waitForFileCard = async (): Promise<DOMRect | null> => {
        const maxAttempts = 20;
        const delayMs = 50;
        const fileId = viewerTransition.exitFileId;

        if (!fileId) {
          console.warn('ViewerZoomTransition: No exitFileId for exit transition');
          return null;
        }

        // Step 1: Find the file card element
        let fileCard: Element | null = null;
        for (let i = 0; i < maxAttempts; i++) {
          fileCard = document.querySelector(`[data-file-id="${fileId}"]`);
          if (fileCard) break;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        if (!fileCard) {
          console.warn('ViewerZoomTransition: File card not found for exit transition');
          // Fallback to center position
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          const thumbnailSize = 200;
          return new DOMRect(
            centerX - thumbnailSize / 2,
            centerY - thumbnailSize / 2,
            thumbnailSize,
            thumbnailSize
          );
        }

        // Step 2: Find thumbnail image inside card
        const thumbnailImg = fileCard.querySelector('img') as HTMLImageElement;
        if (thumbnailImg) {
          return thumbnailImg.getBoundingClientRect();
        } else {
          // Fallback to card position if no image found
          return fileCard.getBoundingClientRect();
        }
      };

      waitForFileCard().then(fileCardRect => {
        if (!fileCardRect || !isMounted) {
          actions.endViewerTransition();
          return;
        }

        // Found file card - start animation
        actions.startZoom();
        setTargetRect(fileCardRect);
        setAnimationPhase('zooming');

        const zoomDuration = 400;

        transitionTimer = window.setTimeout(() => {
          if (!isMounted) return;
          actions.endViewerTransition();
        }, zoomDuration);
      });
    } else {
      // ENTRY TRANSITION: Search for PDF page, then zoom
      setAnimationPhase('searching');

    const waitForPdfPage = async (): Promise<DOMRect | null> => {
      const maxAttempts = 20;
      const delayMs = 50;

      // Step 1: Find the element
      let pageElement: Element | null = null;
      for (let i = 0; i < maxAttempts; i++) {
        pageElement = document.querySelector('[data-page-index="0"]');
        if (pageElement) break;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      if (!pageElement) {
        console.warn('ViewerZoomTransition: PDF page not found');
        return null;
      }

      // Step 2: Wait for size to stabilize
      let stableRect: DOMRect | null = null;
      let previousSize = { width: 0, height: 0 };
      const stabilityChecks = 5; // Check 5 times to ensure stability
      let stableCount = 0;

      for (let i = 0; i < 10; i++) { // Max 500ms to stabilize
        const currentRect = pageElement.getBoundingClientRect();
        const currentSize = {
          width: currentRect.width,
          height: currentRect.height
        };

        // Check if size has changed from previous measurement
        const sizeChanged = Math.abs(currentSize.width - previousSize.width) > 1 ||
                           Math.abs(currentSize.height - previousSize.height) > 1;

        if (sizeChanged) {
          // Size changed, reset stability counter
          stableCount = 0;
        } else {
          // Size unchanged, increment stability counter
          stableCount++;
          if (stableCount >= stabilityChecks) {
            // Size has been stable for multiple checks - use this
            stableRect = currentRect;
            break;
          }
        }

        previousSize = currentSize;
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Use stable rect if found, otherwise use latest measurement
      return stableRect || pageElement.getBoundingClientRect();
    };

    waitForPdfPage().then(pdfPageRect => {
      if (!pdfPageRect || !isMounted) {
        actions.endViewerTransition();
        return;
      }

      // Found PDF page - trigger screenshot fade and start animation
      actions.startZoom(); // Triggers 200ms fade of screenshot
      setTargetRect(pdfPageRect);
      setAnimationPhase('zooming');

      const zoomDuration = 400;

      // After zoom completes, wait for PDF to be fully rendered before removing thumbnail
      transitionTimer = window.setTimeout(async () => {
        if (!isMounted) return;

        // Wait for PDF to be ready (check for rendered canvas or content)
        let pdfReady = false;
        for (let i = 0; i < 10; i++) {
          const pageElement = document.querySelector('[data-page-index="0"]');
          if (pageElement) {
            // Check if page has actual content rendered (canvas or img)
            const hasContent = pageElement.querySelector('canvas, img');
            if (hasContent) {
              pdfReady = true;
              break;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 50));
        }

          // Remove thumbnail now that PDF is ready (or timeout reached)
        actions.endViewerTransition();
      }, zoomDuration);
    });
    }

    return () => {
      isMounted = false;
      if (transitionTimer !== null) {
        clearTimeout(transitionTimer);
      }
    };
  }, [viewerTransition.isAnimating, actions, isExitTransition]);

  // Don't render if not animating
  if (!viewerTransition.isAnimating) {
    return null;
  }

  // Must have thumbnail URL
  if (!viewerTransition.sourceThumbnailUrl) {
    return null;
  }

  const { sourceThumbnailUrl, exitTargetRect, sourceRect } = viewerTransition;

  // Calculate styles based on direction
  let initialStyle: React.CSSProperties;
  let finalStyle: React.CSSProperties | undefined;

  if (isExitTransition && exitTargetRect) {
    // EXIT: Start at PDF page (exitTargetRect), end at file card (targetRect)
    initialStyle = {
      position: 'fixed',
      top: `${exitTargetRect.top}px`,
      left: `${exitTargetRect.left}px`,
      width: `${exitTargetRect.width}px`,
      height: `${exitTargetRect.height}px`,
      borderRadius: '0',
      overflow: 'hidden',
      zIndex: 10000,
    };

    finalStyle = targetRect ? {
      top: `${targetRect.top}px`,
      left: `${targetRect.left}px`,
      width: `${targetRect.width}px`,
      height: `${targetRect.height}px`,
      borderRadius: '8px',
    } : undefined;
  } else if (sourceRect) {
    // ENTRY: Start at source thumbnail, end at PDF page (existing logic)
    initialStyle = {
      position: 'fixed',
      top: `${sourceRect.top}px`,
      left: `${sourceRect.left}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      borderRadius: '8px',
      overflow: 'hidden',
      zIndex: 10000,
    };

    finalStyle = targetRect ? {
      top: `${targetRect.top}px`,
      left: `${targetRect.left}px`,
      width: `${targetRect.width}px`,
      height: `${targetRect.height}px`,
      borderRadius: '0',
    } : undefined;
  } else {
    // No position info available
    return null;
  }

  // Determine if we should apply zoom animation
  const shouldZoom = animationPhase === 'zooming' && finalStyle;

  // Build class names for thumbnail
  const thumbnailClasses = [
    styles.thumbnail,
    shouldZoom && styles.thumbnailZoomed,
  ].filter(Boolean).join(' ');

  return (
    <>
      {/* Animated thumbnail - no backdrop needed */}
      <div
        className={thumbnailClasses}
        style={{
          ...initialStyle,
          ...(shouldZoom ? finalStyle : {}),
        }}
        aria-hidden="true"
      >
        <img
          src={sourceThumbnailUrl}
          alt="Transitioning to viewer"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: '#ffffff',
          }}
        />
      </div>
    </>
  );
};
