import { useMemo } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { alert } from '@app/components/toast';
import type { ToastLocation } from '@app/components/toast/types';
import type { RightRailButtonWithAction } from '@app/hooks/useRightRailButtons';
import { useIsMobile } from '@app/hooks/useIsMobile';

type Pane = 'base' | 'comparison';

export interface UseCompareRightRailButtonsOptions {
  layout: 'side-by-side' | 'stacked';
  toggleLayout: () => void;
  isPanMode: boolean;
  setIsPanMode: (value: boolean) => void;
  baseZoom: number;
  comparisonZoom: number;
  setBaseZoom: (value: number) => void;
  setComparisonZoom: (value: number) => void;
  setPanToTopLeft: (pane: Pane) => void;
  centerPanForZoom: (pane: Pane, zoom: number) => void;
  clampPanForZoom: (pane: Pane, zoom: number) => void;
  clearScrollLinkDelta: () => void;
  captureScrollLinkDelta: () => void;
  isScrollLinked: boolean;
  setIsScrollLinked: (value: boolean) => void;
  zoomLimits: { min: number; max: number; step: number };
  baseScrollRef?: React.RefObject<HTMLDivElement | null>;
  comparisonScrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const useCompareRightRailButtons = ({
  layout,
  toggleLayout,
  isPanMode,
  setIsPanMode,
  baseZoom,
  comparisonZoom,
  setBaseZoom,
  setComparisonZoom,
  setPanToTopLeft,
  centerPanForZoom,
  clampPanForZoom,
  clearScrollLinkDelta,
  captureScrollLinkDelta,
  isScrollLinked,
  setIsScrollLinked,
  zoomLimits,
  baseScrollRef,
  comparisonScrollRef,
}: UseCompareRightRailButtonsOptions): RightRailButtonWithAction[] => {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();

  return useMemo<RightRailButtonWithAction[]>(() => [
    {
      id: 'compare-toggle-layout',
      icon: (
        <LocalIcon
          icon={layout === 'side-by-side' ? 'vertical-split-rounded' : 'horizontal-split-rounded'}
          width="1.5rem"
          height="1.5rem"
        />
      ),
      tooltip: layout === 'side-by-side'
        ? t('compare.actions.stackVertically', 'Stack vertically')
        : t('compare.actions.placeSideBySide', 'Place side by side'),
      ariaLabel: layout === 'side-by-side'
        ? t('compare.actions.stackVertically', 'Stack vertically')
        : t('compare.actions.placeSideBySide', 'Place side by side'),
      section: 'top',
      order: 10,
      onClick: toggleLayout,
    },
    {
      id: 'compare-zoom-out',
      icon: <LocalIcon icon="zoom-out" width="1.5rem" height="1.5rem" />,
      tooltip: t('compare.actions.zoomOut', 'Zoom out'),
      ariaLabel: t('compare.actions.zoomOut', 'Zoom out'),
      section: 'top',
      order: 13,
      onClick: () => {
        const { min, step } = zoomLimits;
        const nextBase = Math.max(min, +(baseZoom - step).toFixed(2));
        const nextComparison = Math.max(min, +(comparisonZoom - step).toFixed(2));
        setBaseZoom(nextBase);
        setComparisonZoom(nextComparison);
        centerPanForZoom('base', nextBase);
        centerPanForZoom('comparison', nextComparison);
      },
    },
    {
      id: 'compare-zoom-in',
      icon: <LocalIcon icon="zoom-in" width="1.5rem" height="1.5rem" />,
      tooltip: t('compare.actions.zoomIn', 'Zoom in'),
      ariaLabel: t('compare.actions.zoomIn', 'Zoom in'),
      section: 'top',
      order: 14,
      onClick: () => {
        const { max, step } = zoomLimits;
        const nextBase = Math.min(max, +(baseZoom + step).toFixed(2));
        const nextComparison = Math.min(max, +(comparisonZoom + step).toFixed(2));
        setBaseZoom(nextBase);
        setComparisonZoom(nextComparison);
        clampPanForZoom('base', nextBase);
        clampPanForZoom('comparison', nextComparison);
      },
    },
    {
      id: 'compare-reset-view',
      icon: <LocalIcon icon="refresh-rounded" width="1.5rem" height="1.5rem" />,
      tooltip: t('compare.actions.resetView', 'Reset zoom and pan'),
      ariaLabel: t('compare.actions.resetView', 'Reset zoom and pan'),
      section: 'top',
      order: 14.5,
      disabled: baseZoom === 1 && comparisonZoom === 1,
      onClick: () => {
        setBaseZoom(1);
        setComparisonZoom(1);
    setPanToTopLeft('base');
    setPanToTopLeft('comparison');
        clearScrollLinkDelta();
        // Reset scrollTop for both panes to realign view
        if (baseScrollRef?.current) {
          baseScrollRef.current.scrollTop = 0;
        }
        if (comparisonScrollRef?.current) {
          comparisonScrollRef.current.scrollTop = 0;
        }
      },
    },
    {
      id: 'compare-toggle-scroll-link',
      icon: (
        <LocalIcon
          icon={isScrollLinked ? 'link-rounded' : 'link-off-rounded'}
          width="1.5rem"
          height="1.5rem"
        />
      ),
      tooltip: isScrollLinked
        ? t('compare.actions.unlinkScroll', 'Unlink scroll')
        : t('compare.actions.linkScroll', 'Link scroll'),
      ariaLabel: isScrollLinked
        ? t('compare.actions.unlinkScroll', 'Unlink scroll')
        : t('compare.actions.linkScroll', 'Link scroll'),
      section: 'top',
      order: 15,
      onClick: () => {
        const next = !isScrollLinked;
        if (next) {
          captureScrollLinkDelta();
        } else {
          if (!isMobile) {
            alert({
              alertType: 'neutral',
              title: t('compare.toasts.unlinkedTitle', 'Independent scroll enabled'),
              body: t('compare.toasts.unlinkedBody', 'Tip: Arrow Up/Down scroll both panes when unlinked is off.'),
              durationMs: 5000,
              location: 'bottom-center' as ToastLocation,
              expandable: false,
            });
          }
        }
        setIsScrollLinked(next);
      },
    },
  ], [
    layout,
    toggleLayout,
    isPanMode,
    setIsPanMode,
    baseZoom,
    comparisonZoom,
    setBaseZoom,
    setComparisonZoom,
    centerPanForZoom,
    clampPanForZoom,
  setPanToTopLeft,
    clearScrollLinkDelta,
    captureScrollLinkDelta,
    isScrollLinked,
    setIsScrollLinked,
    zoomLimits,
    t,
    i18n.language,
    isMobile,
  ]);
};

export type UseCompareRightRailButtonsReturn = ReturnType<typeof useCompareRightRailButtons>;
