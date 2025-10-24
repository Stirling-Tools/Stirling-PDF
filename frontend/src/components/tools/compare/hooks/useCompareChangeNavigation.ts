import { RefObject, useCallback } from 'react';

type Pane = 'base' | 'comparison';

export const useCompareChangeNavigation = (
  baseScrollRef: RefObject<HTMLDivElement | null>,
  comparisonScrollRef: RefObject<HTMLDivElement | null>
) => {
  return useCallback(
    (changeValue: string, pane: Pane, pageNumber?: number) => {
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
        container.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
        return true;
      };

      let nodes = findNodes();
      if (nodes.length === 0) {
        scrollToPageIfNeeded();
      }

      let attempts = 0;
      const ensureAndScroll = () => {
        nodes = findNodes();
        if (nodes.length === 0 && attempts < 12) {
          attempts += 1;
          scrollToPageIfNeeded();
          window.requestAnimationFrame(ensureAndScroll);
          return;
        }
        if (nodes.length === 0) {
          return;
        }

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
        const desiredTop = Math.max(0, absoluteTop - (container.clientHeight - boxHeight) / 2);
        const desiredLeft = Math.max(0, absoluteLeft - (container.clientWidth - boxWidth) / 2);

        container.scrollTo({ top: desiredTop, left: desiredLeft, behavior: 'smooth' });

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

      ensureAndScroll();
    },
    [baseScrollRef, comparisonScrollRef]
  );
};

export type UseCompareChangeNavigationReturn = ReturnType<typeof useCompareChangeNavigation>;
