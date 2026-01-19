import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigationState, useNavigationActions } from '@app/contexts/NavigationContext';
import { useFileState } from '@app/contexts/FileContext';
import { PAGE_EDITOR_TRANSITION } from '@app/constants/animations';
import { getContainedImageRect, getCenteredFallbackRect } from '@app/utils/dom';
import styles from '@app/components/pageEditor/PageEditorSpreadTransition.module.css';

type AnimationPhase = 'idle' | 'ready' | 'gliding';

const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const waitForElement = (
  selector: string,
  timeoutMs: number,
  shouldAbort?: () => boolean
): Promise<HTMLElement | null> => {
  const existing = document.querySelector(selector) as HTMLElement | null;
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise(resolve => {
    let resolved = false;
    const finish = (value: HTMLElement | null) => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      resolve(value);
    };

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector) as HTMLElement | null;
      if (found) {
        finish(found);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const start = performance.now();
    const tick = () => {
      if (resolved) return;
      if (shouldAbort?.()) {
        finish(null);
        return;
      }
      if (performance.now() - start >= timeoutMs) {
        finish(null);
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
};

const waitForStableRect = (
  element: Element,
  options: { stableDurationMs: number; timeoutMs: number },
  shouldAbort?: () => boolean
): Promise<DOMRect> => {
  return new Promise(resolve => {
    let lastRect = element.getBoundingClientRect();
    let lastChange = performance.now();
    const start = lastChange;
    let rafId: number | null = null;

    const observer = new ResizeObserver(() => {
      scheduleCheck();
    });

    const cleanup = () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = null;
    };

    const check = () => {
      rafId = null;

      if (shouldAbort?.()) {
        cleanup();
        resolve(element.getBoundingClientRect());
        return;
      }

      const rect = element.getBoundingClientRect();
      const sizeChanged = Math.abs(rect.width - lastRect.width) > 1 ||
        Math.abs(rect.height - lastRect.height) > 1;

      if (sizeChanged) {
        lastRect = rect;
        lastChange = performance.now();
      }

      const now = performance.now();
      const stableEnough = now - lastChange >= options.stableDurationMs;
      const timedOut = now - start >= options.timeoutMs;

      if (stableEnough || timedOut) {
        cleanup();
        resolve(rect);
        return;
      }

      scheduleCheck();
    };

    const scheduleCheck = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(check);
      }
    };

    observer.observe(element);
    scheduleCheck();
  });
};

const waitForTransitionEnd = (
  element: HTMLElement,
  options: { propertyName?: string; timeoutMs: number },
  shouldAbort?: () => boolean
): Promise<void> => {
  return new Promise(resolve => {
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      element.removeEventListener('transitionend', handleEnd);
      resolve();
    };

    const handleEnd = (event: TransitionEvent) => {
      if (event.target !== element) return;
      if (options.propertyName && event.propertyName !== options.propertyName) return;
      finish();
    };

    element.addEventListener('transitionend', handleEnd);

    const start = performance.now();
    const tick = () => {
      if (resolved) return;
      if (shouldAbort?.()) {
        finish();
        return;
      }
      if (performance.now() - start >= options.timeoutMs) {
        finish();
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
};

const waitForOpacity = (
  element: HTMLElement,
  options: { targetOpacity: number; timeoutMs: number },
  shouldAbort?: () => boolean
): Promise<void> => {
  return new Promise(resolve => {
    const start = performance.now();
    const tick = () => {
      if (shouldAbort?.()) {
        resolve();
        return;
      }

      const opacity = Number.parseFloat(getComputedStyle(element).opacity || '1');
      if (opacity >= options.targetOpacity) {
        resolve();
        return;
      }

      if (performance.now() - start >= options.timeoutMs) {
        resolve();
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
};

/**
 * PageEditorSpreadTransition - First page glide animation
 *
 * Animation sequence:
 * 1. First page thumbnail glides from file card to its position in page editor grid
 * 2. Smoothly transitions size and position like viewer zoom
 */
export const PageEditorSpreadTransition: React.FC = () => {
  const { pageEditorTransition } = useNavigationState();
  const { actions } = useNavigationActions();
  const { selectors } = useFileState();
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>('idle');
  const [firstPageTargetRect, setFirstPageTargetRect] = useState<DOMRect | null>(null);
  const transitionRef = useRef<HTMLDivElement | null>(null);
  const lastScreenshotRef = useRef<string | null>(null);

  const isActive = pageEditorTransition?.isAnimating ?? false;
  const direction = pageEditorTransition?.direction ?? 'enter';
  const fileCardRects = pageEditorTransition?.fileCardRects ?? new Map();
  const filePageCounts = pageEditorTransition?.filePageCounts ?? new Map();
  const pageThumbnails = pageEditorTransition?.pageThumbnails ?? new Map();

  useEffect(() => {
    const currentUrl = pageEditorTransition?.editorScreenshotUrl ?? null;
    const previousUrl = lastScreenshotRef.current;

    if (currentUrl && currentUrl !== previousUrl) {
      if (previousUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previousUrl);
      }
      lastScreenshotRef.current = currentUrl;
    }

    if (!isActive && lastScreenshotRef.current) {
      const urlToRevoke = lastScreenshotRef.current;
      if (urlToRevoke.startsWith('blob:')) {
        URL.revokeObjectURL(urlToRevoke);
      }
      lastScreenshotRef.current = null;
    }

    return () => {
      if (lastScreenshotRef.current) {
        const urlToRevoke = lastScreenshotRef.current;
        if (urlToRevoke.startsWith('blob:')) {
          URL.revokeObjectURL(urlToRevoke);
        }
        lastScreenshotRef.current = null;
      }
    };
  }, [pageEditorTransition?.editorScreenshotUrl, isActive]);

  // Build animation data for all pages
  const pageAnimations = useMemo(() => {
    if (!isActive) return [];
    // For burst pages, we need the discovered first page rect
    if (!firstPageTargetRect) return [];

    const animations: Array<{
      pageIndex: number;
      fileId: string;
      sourceRect: DOMRect;
      targetRect: DOMRect | null; // Will be set after pages render
      staggerDelay: number;
      thumbnailUrl: string | null;
      isFirstPage: boolean;
    }> = [];

    let cumulativePageIndex = 0;
    const activeFiles = selectors.getFiles();

    activeFiles.forEach((file, fileIndex) => {
      const fileId = file.fileId;
      const cardRect = fileCardRects.get(fileId);
      const pageCount = filePageCounts.get(fileId) || 0;

      if (pageCount === 0) return;

      if (cardRect) {
        for (let i = 0; i < pageCount; i++) {
          const pageIndex = cumulativePageIndex + i;
          const isFirstPage = i === 0;

          // Get actual page thumbnail from the captured map
          const thumbnailUrl = isFirstPage ? pageThumbnails.get(fileId) || null : null;

          // Target rect will be queried from actual DOM elements
          const targetRect = null;

          // For the first page, source is the file card
          // For other pages, source is the first page's target position (they burst from there)
          const sourceRect = isFirstPage ? cardRect : firstPageTargetRect;

          // No stagger - all pages burst simultaneously
          const staggerDelay = 0;

          animations.push({
            pageIndex,
            fileId,
            sourceRect,
            targetRect,
            staggerDelay,
            thumbnailUrl,
            isFirstPage,
          });
        }
      }

      cumulativePageIndex += pageCount;
    });

    return animations.slice(0, PAGE_EDITOR_TRANSITION.MAX_ANIMATED_PAGES);
  }, [isActive, fileCardRects, filePageCounts, pageThumbnails, firstPageTargetRect, selectors]);

  // Get first page animations
  const firstPages = useMemo(() => pageAnimations.filter(p => p.isFirstPage), [pageAnimations]);

  // Animation orchestration
  useEffect(() => {
    let mounted = true;
    const shouldAbort = () => !mounted;

    if (!isActive) {
      setAnimationPhase('idle');
      setFirstPageTargetRect(null);
      return () => {
        mounted = false;
      };
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      actions.endPageEditorTransition();
      return () => { mounted = false; };
    }

    const runAnimation = async () => {
      if (!mounted) return;

      // Phase 0: Wait for PageEditor to render and find first page's actual position
      const firstPage = await waitForElement('[data-page-number="1"]', 1000, shouldAbort);
      if (!mounted) return;

      let firstPageRect: DOMRect;
      if (firstPage) {
        await waitForStableRect(firstPage, { stableDurationMs: 250, timeoutMs: 500 }, shouldAbort);
        if (!mounted) return;
        const img = firstPage.querySelector('img') as HTMLImageElement | null;
        firstPageRect = img
          ? getContainedImageRect(img)
          : firstPage.getBoundingClientRect();
      } else {
        firstPageRect = getCenteredFallbackRect();
      }

      if (!mounted) return;

      // Store the discovered first page position
      setFirstPageTargetRect(firstPageRect);

      // Wait for pageAnimations to recalculate with the new target rect
      await nextPaint();

      if (!mounted) return;

      // Phase 1: Ready - render element with initial transform
      setAnimationPhase('ready');

      // Wait for browser to paint initial state
      await nextPaint();

      if (!mounted) return;

      // Phase 2: Gliding - apply target transform
      const transitionEl = transitionRef.current;
      setAnimationPhase('gliding');
      if (transitionEl) {
        await waitForTransitionEnd(
          transitionEl,
          { propertyName: 'transform', timeoutMs: PAGE_EDITOR_TRANSITION.SPREAD_DURATION + 150 },
          shouldAbort
        );
      }

      if (!mounted) return;

      window.dispatchEvent(new Event(PAGE_EDITOR_TRANSITION.GLIDE_COMPLETE_EVENT));

      // Phase 3: Wait for first page fade in
      const renderedFirstPage = document.querySelector('[data-page-number="1"]') as HTMLElement | null;
      if (renderedFirstPage) {
        await waitForOpacity(renderedFirstPage, { targetOpacity: 1, timeoutMs: 350 }, shouldAbort);
      }

      if (!mounted) return;

      actions.endPageEditorTransition();
    };

    runAnimation();

    return () => {
      mounted = false;
    };
  }, [isActive, actions]);

  if (!isActive) {
    return null;
  }

  const isReady = animationPhase === 'ready';
  const isGliding = animationPhase === 'gliding';
  const shouldRenderGlide = (isReady || isGliding) && firstPageTargetRect && firstPages.length > 0;

  return (
    <>
      {/* Optional screenshot background */}
      {pageEditorTransition?.editorScreenshotUrl && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: window.innerWidth,
            height: window.innerHeight,
            opacity: isGliding ? 0 : 1,
            transition: 'opacity 200ms ease-out',
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        >
          <img
            src={pageEditorTransition.editorScreenshotUrl}
            alt="Loading..."
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              display: 'block',
            }}
          />
        </div>
      )}

      {/* First page(s) gliding animation */}
      {shouldRenderGlide && firstPages.map((anim, idx) => {
        const { sourceRect, thumbnailUrl } = anim;
        const targetRect = firstPageTargetRect;

        // Calculate target transform values
        const translateX = targetRect.left - sourceRect.left;
        const translateY = targetRect.top - sourceRect.top;
        const scaleX = targetRect.width / sourceRect.width;
        const scaleY = targetRect.height / sourceRect.height;

        const targetTransform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`;

        // Initial style - always at source position with identity transform
        // First file gets highest z-index, subsequent files stack below
        const initialStyle: React.CSSProperties = {
          position: 'fixed',
          top: sourceRect.top,
          left: sourceRect.left,
          width: sourceRect.width,
          height: sourceRect.height,
          transform: 'translate3d(0px, 0px, 0) scale(1)',
          transformOrigin: 'top left',
          opacity: 1,
          zIndex: PAGE_EDITOR_TRANSITION.OVERLAY_Z_INDEX + 100 - idx,
        };

        // Target style - applied when gliding
        const glideStyle: React.CSSProperties = isGliding
          ? { transform: targetTransform }
          : {};

        return (
          <div
            key={`first-${anim.fileId}`}
            className={styles.spreadingPage}
            ref={idx === 0 ? transitionRef : undefined}
            style={{
              ...initialStyle,
              ...glideStyle,
            }}
          >
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  background: '#ffffff',
                  border: '1px solid var(--border-default)',
                }}
              />
            )}
          </div>
        );
      })}
    </>
  );
};
