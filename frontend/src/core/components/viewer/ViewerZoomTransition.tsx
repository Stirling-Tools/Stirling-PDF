import React, { useEffect, useState } from 'react';
import { useNavigationState, useNavigationActions } from '@app/contexts/NavigationContext';
import { VIEWER_TRANSITION } from '@app/constants/animations';
import { getCenteredFallbackRect } from '@app/utils/dom';
import styles from '@app/components/viewer/ViewerZoomTransition.module.css';

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
  const getFallbackRect = () => getCenteredFallbackRect();

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

    setAnimationPhase('searching');

    if (isExitTransition) {
      // EXIT: start at PDF page rect (already captured), zoom to file card
      const waitForFileCard = async (): Promise<DOMRect> => {
        const maxAttempts = 20;
        const delayMs = 50;
        const fileId = viewerTransition.exitFileId;
        if (!fileId) return getFallbackRect();

        let card: Element | null = null;
        for (let i = 0; i < maxAttempts; i++) {
          card = document.querySelector(`[data-file-id="${fileId}"]`);
          if (card) break;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        if (!card) {
          console.warn('ViewerZoomTransition: file card not found, using fallback rect');
          return getFallbackRect();
        }

        const img = card.querySelector('img') as HTMLImageElement | null;
        return img ? img.getBoundingClientRect() : card.getBoundingClientRect();
      };

      waitForFileCard().then(cardRect => {
        if (!isMounted) return;

        actions.startZoom();
        setTargetRect(cardRect);
        setAnimationPhase('zooming');

        transitionTimer = window.setTimeout(() => {
          if (!isMounted) return;
          actions.endViewerTransition();
        }, VIEWER_TRANSITION.ZOOM_DURATION);
      });
    } else {
      const waitForPdfPage = async (): Promise<DOMRect> => {
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
          console.warn('ViewerZoomTransition: PDF page not found, using fallback rect');
          return viewerTransition.sourceRect || getFallbackRect();
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
        if (!isMounted) {
          return;
        }

        // Found PDF page - trigger screenshot fade and start animation
        actions.startZoom(); // Triggers 200ms fade of screenshot
        setTargetRect(pdfPageRect);
        setAnimationPhase('zooming');

        const zoomDuration = VIEWER_TRANSITION.ZOOM_DURATION;

        // After zoom completes, wait for PDF to be fully rendered before removing thumbnail
        transitionTimer = window.setTimeout(async () => {
          if (!isMounted) return;

          // Wait for PDF to be ready (check for rendered canvas or content)
          for (let i = 0; i < 10; i++) {
            const pageElement = document.querySelector('[data-page-index="0"]');
            if (pageElement) {
              // Check if page has actual content rendered (canvas or img)
              const hasContent = pageElement.querySelector('canvas, img');
              if (hasContent) {
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
  }, [viewerTransition.isAnimating, viewerTransition.exitFileId, viewerTransition.sourceRect, isExitTransition, actions]);

  // Don't render if not animating or missing thumbnail
  if (!viewerTransition.isAnimating || !viewerTransition.sourceThumbnailUrl) {
    return null;
  }

  const { sourceThumbnailUrl } = viewerTransition;
  const initialRect = isExitTransition
    ? (viewerTransition.exitTargetRect || viewerTransition.sourceRect || getFallbackRect())
    : (viewerTransition.sourceRect || getFallbackRect());

  const initialRadius = '0';
  const targetRadius = '0';
  const initialWidth = Math.max(initialRect.width, 1);
  const initialHeight = Math.max(initialRect.height, 1);

  // Calculate initial styles based on source element position
  const initialStyle: React.CSSProperties = {
    position: 'fixed',
    top: `${initialRect.top}px`,
    left: `${initialRect.left}px`,
    width: `${initialWidth}px`,
    height: `${initialHeight}px`,
    borderRadius: initialRadius,
    overflow: 'hidden',
    zIndex: VIEWER_TRANSITION.OVERLAY_Z_INDEX,
    transform: 'translate3d(0px, 0px, 0) scale(1)',
    transformOrigin: 'top left',
  };

  const targetTransform = targetRect
    ? `translate3d(${targetRect.left - initialRect.left}px, ${targetRect.top - initialRect.top}px, 0) scale(${targetRect.width / initialWidth}, ${targetRect.height / initialHeight})`
    : null;

  // Determine if we should apply zoom animation
  const shouldZoom = animationPhase === 'zooming' && targetTransform !== null;
  const zoomStyle: React.CSSProperties = shouldZoom && targetTransform
    ? { transform: targetTransform, borderRadius: targetRadius }
    : {};

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
          ...zoomStyle,
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
