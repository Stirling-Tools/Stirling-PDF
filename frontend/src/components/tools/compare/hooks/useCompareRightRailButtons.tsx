import { useMemo } from 'react';
import { ActionIcon } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '../../../shared/LocalIcon';
import { Tooltip } from '../../../shared/Tooltip';
import { alert } from '../../../toast';
import type { ToastLocation } from '../../../toast/types';
import type { RightRailButtonWithAction } from '../../../../hooks/useRightRailButtons';

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
  centerPanForZoom: (pane: Pane, zoom: number) => void;
  clampPanForZoom: (pane: Pane, zoom: number) => void;
  clearScrollLinkDelta: () => void;
  captureScrollLinkDelta: () => void;
  isScrollLinked: boolean;
  setIsScrollLinked: (value: boolean) => void;
  zoomLimits: { min: number; max: number; step: number };
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
  centerPanForZoom,
  clampPanForZoom,
  clearScrollLinkDelta,
  captureScrollLinkDelta,
  isScrollLinked,
  setIsScrollLinked,
  zoomLimits,
}: UseCompareRightRailButtonsOptions): RightRailButtonWithAction[] => {
  const { t } = useTranslation();

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
      id: 'compare-pan-mode',
      section: 'top',
      order: 12,
      render: ({ disabled }: { disabled: boolean }) => (
        <Tooltip content={t('rightRail.panMode', 'Pan Mode')} position="left" offset={12} arrow portalTarget={document.body}>
          <ActionIcon
            variant={isPanMode ? 'default' : 'subtle'}
            radius="md"
            className="right-rail-icon"
            onClick={() => setIsPanMode(!isPanMode)}
            disabled={disabled}
            aria-label={t('rightRail.panMode', 'Pan Mode')}
            style={isPanMode ? { backgroundColor: 'var(--right-rail-pan-active-bg)' } : undefined}
          >
            <LocalIcon icon="pan-tool-rounded" width="1.5rem" height="1.5rem" />
          </ActionIcon>
        </Tooltip>
      ),
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
      onClick: () => {
        setBaseZoom(1);
        setComparisonZoom(1);
        centerPanForZoom('base', 1);
        centerPanForZoom('comparison', 1);
        clearScrollLinkDelta();
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
        ? t('compare.actions.unlinkScrollPan', 'Unlink scroll and pan')
        : t('compare.actions.linkScrollPan', 'Link scroll and pan'),
      ariaLabel: isScrollLinked
        ? t('compare.actions.unlinkScrollPan', 'Unlink scroll and pan')
        : t('compare.actions.linkScrollPan', 'Link scroll and pan'),
      section: 'top',
      order: 15,
      onClick: () => {
        const next = !isScrollLinked;
        if (next) {
          captureScrollLinkDelta();
        } else {
          alert({
            alertType: 'neutral',
            title: t('compare.toasts.unlinkedTitle', 'Independent scroll & pan enabled'),
            body: t('compare.toasts.unlinkedBody', 'Tip: Arrow Up/Down scroll both panes; panning only moves the active pane.'),
            durationMs: 5000,
            location: 'bottom-center' as ToastLocation,
            expandable: false,
          });
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
    clearScrollLinkDelta,
    captureScrollLinkDelta,
    isScrollLinked,
    setIsScrollLinked,
    zoomLimits,
    t,
  ]);
};

export type UseCompareRightRailButtonsReturn = ReturnType<typeof useCompareRightRailButtons>;
