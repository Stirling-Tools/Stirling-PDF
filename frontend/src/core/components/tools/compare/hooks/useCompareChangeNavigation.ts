import { RefObject, useCallback } from 'react';

type Pane = 'base' | 'comparison';

type SuppressOptions = {
  temporarilySuppressScrollLink?: (fn: () => void, durationMs?: number) => void;
};

export const useCompareChangeNavigation = (
  baseScrollRef: RefObject<HTMLDivElement | null>,
  comparisonScrollRef: RefObject<HTMLDivElement | null>,
  options?: SuppressOptions,
) => {
  return useCallback(
    (changeValue: string, pane: Pane, pageNumber?: number) => {
      const suppress = <T extends void>(fn: () => T) => {
        if (options?.temporarilySuppressScrollLink) {
          options.temporarilySuppressScrollLink(fn, 700);
        } else {
          fn();
        }
      };

      const targetRef = pane === 'base' ? baseScrollRef : comparisonScrollRef;
      const container = targetRef.current;
      if (!container) {
        return;
      }

      const findNodes = (): HTMLElement[] => {
        return Array.from(
          container.querySelectorAll(`[data-change-id="${changeValue}"]`)
        ) as HTMLElement[];
      };

      const scrollToPageIfNeeded = () => {
        if (!pageNumber) return false;
        const pageEl = container.querySelector(
          `.compare-diff-page[data-page-number="${pageNumber}"]`
        ) as HTMLElement | null;
        if (!pageEl) return false;
        const top = pageEl.offsetTop - Math.round(container.clientHeight * 0.2);
        suppress(() => {
          container.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
        });
        return true;
      };

      const scrollPeerPageIfPossible = () => {
        if (!pageNumber) return;
        const peerRef = pane === 'base' ? comparisonScrollRef : baseScrollRef;
        const peer = peerRef.current;
        if (!peer) return;
        const peerPageEl = peer.querySelector(
          `.compare-diff-page[data-page-number="${pageNumber}"]`
        ) as HTMLElement | null;
        if (!peerPageEl) return;
        const peerMaxTop = Math.max(0, peer.scrollHeight - peer.clientHeight);
        const top = Math.max(
          0,
          Math.min(
            peerMaxTop,
            peerPageEl.offsetTop - Math.round(peer.clientHeight * 0.2)
          )
        );
        suppress(() => {
          peer.scrollTo({ top, behavior: 'auto' });
        });
      };

      const proceedWithNodes = (nodes: HTMLElement[]) => {
        if (nodes.length === 0) return;

        // Prefer a percent-in-page based vertical scroll, which is resilient to transforms.
        const anchor = nodes[0];
        const pageEl = anchor.closest('.compare-diff-page') as HTMLElement | null;
        const inner = anchor.closest('.compare-diff-page__inner') as HTMLElement | null;
        const topPercent = parseFloat((anchor as HTMLElement).style.top || '0');
        if (pageEl && inner && !Number.isNaN(topPercent)) {
          const innerRect = inner.getBoundingClientRect();
          const innerHeight = Math.max(1, innerRect.height);
          const absoluteTopInPage = (topPercent / 100) * innerHeight;
          const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
          const desiredTop = Math.max(
            0,
            Math.min(maxTop, pageEl.offsetTop + absoluteTopInPage - container.clientHeight / 2)
          );
          suppress(() => {
            container.scrollTo({ top: desiredTop, behavior: 'auto' });
          });
        } else {
          // Fallback to bounding-rect based centering if percent approach is unavailable.
          const containerRect = container.getBoundingClientRect();
          let minTop = Number.POSITIVE_INFINITY;
          let minLeft = Number.POSITIVE_INFINITY;
          let maxBottom = Number.NEGATIVE_INFINITY;
          let maxRight = Number.NEGATIVE_INFINITY;
  
          nodes.forEach((element) => {
            const rect = element.getBoundingClientRect();
            minTop = Math.min(minTop, rect.top);
            minLeft = Math.min(minLeft, rect.left);
            maxBottom = Math.max(maxBottom, rect.bottom);
            maxRight = Math.max(maxRight, rect.right);
          });
  
          const boxHeight = Math.max(1, maxBottom - minTop);
          const boxWidth = Math.max(1, maxRight - minLeft);
          const absoluteTop = minTop - containerRect.top + container.scrollTop;
          const absoluteLeft = minLeft - containerRect.left + container.scrollLeft;
          const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
          const desiredTop = Math.max(0, Math.min(maxTop, absoluteTop - (container.clientHeight - boxHeight) / 2));
          const desiredLeft = Math.max(0, absoluteLeft - (container.clientWidth - boxWidth) / 2);
  
          suppress(() => {
            container.scrollTo({ top: desiredTop, left: desiredLeft, behavior: 'auto' });
          });
        }

        // Also scroll the peer container to the corresponding location in the
        // other PDF (same page and approximate vertical position within page),
        // not just the same list/scroll position.
        const peerRef = pane === 'base' ? comparisonScrollRef : baseScrollRef;
        const peer = peerRef.current;
        if (peer) {
          // Use the first node as the anchor
          const anchor = nodes[0];
          const pageEl = anchor.closest('.compare-diff-page') as HTMLElement | null;
          const pageNumAttr = pageEl?.getAttribute('data-page-number');
          const topPercent = parseFloat((anchor as HTMLElement).style.top || '0');
          if (pageNumAttr) {
            const peerPageEl = peer.querySelector(
              `.compare-diff-page[data-page-number="${pageNumAttr}"]`
            ) as HTMLElement | null;
            const peerInner = peerPageEl?.querySelector('.compare-diff-page__inner') as HTMLElement | null;
            if (peerPageEl && peerInner) {
              const innerRect = peerInner.getBoundingClientRect();
              const innerHeight = Math.max(1, innerRect.height);
              const absoluteTopInPage = (topPercent / 100) * innerHeight;
              const peerMaxTop = Math.max(0, peer.scrollHeight - peer.clientHeight);
              const peerDesiredTop = Math.max(
                0,
                Math.min(peerMaxTop, peerPageEl.offsetTop + absoluteTopInPage - peer.clientHeight / 2)
              );
              suppress(() => {
                peer.scrollTo({ top: peerDesiredTop, behavior: 'auto' });
              });
            } else if (peerPageEl) {
              // Fallback: Scroll to page top (clamped)
              const peerMaxTop = Math.max(0, peer.scrollHeight - peer.clientHeight);
              const top = Math.max(0, Math.min(peerMaxTop, peerPageEl.offsetTop - Math.round(peer.clientHeight * 0.2)));
              suppress(() => {
                peer.scrollTo({ top, behavior: 'auto' });
              });
            }
          }
        }

        const groupsByInner = new Map<HTMLElement, HTMLElement[]>();
        nodes.forEach((element) => {
          const inner = element.closest('.compare-diff-page__inner') as HTMLElement | null;
          if (!inner) return;
          const list = groupsByInner.get(inner) ?? [];
          list.push(element);
          groupsByInner.set(inner, list);
        });

        groupsByInner.forEach((elements, inner) => {
          let minL = 100;
          let minT = 100;
          let maxR = 0;
          let maxB = 0;
          elements.forEach((element) => {
            const leftPercent = parseFloat(element.style.left) || 0;
            const topPercent = parseFloat(element.style.top) || 0;
            const widthPercent = parseFloat(element.style.width) || 0;
            const heightPercent = parseFloat(element.style.height) || 0;
            minL = Math.min(minL, leftPercent);
            minT = Math.min(minT, topPercent);
            maxR = Math.max(maxR, leftPercent + widthPercent);
            maxB = Math.max(maxB, topPercent + heightPercent);
          });
          const overlay = document.createElement('span');
          overlay.className = 'compare-diff-flash-overlay';
          overlay.style.position = 'absolute';
          overlay.style.left = `${minL}%`;
          overlay.style.top = `${minT}%`;
          overlay.style.width = `${Math.max(0.1, maxR - minL)}%`;
          overlay.style.height = `${Math.max(0.1, maxB - minT)}%`;
          inner.appendChild(overlay);
          window.setTimeout(() => overlay.remove(), 1600);
        });

        nodes.forEach((element) => {
          element.classList.remove('compare-diff-highlight--flash');
        });
        void container.clientWidth; // Force reflow
        nodes.forEach((element) => {
          element.classList.add('compare-diff-highlight--flash');
          window.setTimeout(() => element.classList.remove('compare-diff-highlight--flash'), 1600);
        });
      };

      const nodes = findNodes();
      if (nodes.length > 0) {
        proceedWithNodes(nodes);
        return;
      }

      // Page-level fallback immediately so the user sees something happen
      const scrolledPage = scrollToPageIfNeeded();
      if (scrolledPage) {
        scrollPeerPageIfPossible();
      } else {
        // Even if the page element is not present yet, try to nudge peer pane
        scrollPeerPageIfPossible();
      }

      // Wait for highlights to mount (pages/images render progressively)
      let settled = false;
      const observer = new MutationObserver(() => {
        if (settled) return;
        const n = findNodes();
        if (n.length > 0) {
          settled = true;
          observer.disconnect();
          proceedWithNodes(n);
        }
      });
      try {
        observer.observe(container, { childList: true, subtree: true });
      } catch {
        // noop
      }
      // Safety timeout to stop waiting after a while
      window.setTimeout(() => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        // We already scrolled to the page above; nothing else to do.
      }, 5000);
    },
    [baseScrollRef, comparisonScrollRef]
  );
};

export type UseCompareChangeNavigationReturn = ReturnType<typeof useCompareChangeNavigation>;
