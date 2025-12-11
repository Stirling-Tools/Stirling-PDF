import { useMemo, useState } from 'react';
import { ActionIcon, Popover } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@app/contexts/ViewerContext';
import { useRightRailButtons, RightRailButtonWithAction } from '@app/hooks/useRightRailButtons';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { SearchInterface } from '@app/components/viewer/SearchInterface';
import ViewerAnnotationControls from '@app/components/shared/rightRail/ViewerAnnotationControls';
import { useSidebarContext } from '@app/contexts/SidebarContext';
import { useRightRailTooltipSide } from '@app/hooks/useRightRailTooltipSide';

export function useViewerRightRailButtons() {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const [isPanning, setIsPanning] = useState<boolean>(() => viewer.getPanState()?.isPanning ?? false);
  const { sidebarRefs } = useSidebarContext();
  const { position: tooltipPosition } = useRightRailTooltipSide(sidebarRefs, 12);

  // Lift i18n labels out of memo for clarity
  const searchLabel = t('rightRail.search', 'Search PDF');
  const panLabel = t('rightRail.panMode', 'Pan Mode');
  const rotateLeftLabel = t('rightRail.rotateLeft', 'Rotate Left');
  const rotateRightLabel = t('rightRail.rotateRight', 'Rotate Right');
  const sidebarLabel = t('rightRail.toggleSidebar', 'Toggle Sidebar');
  const bookmarkLabel = t('rightRail.toggleBookmarks', 'Toggle Bookmarks');
  const printLabel = t('rightRail.print', 'Print PDF');

  const viewerButtons = useMemo<RightRailButtonWithAction[]>(() => {
    return [
      {
        id: 'viewer-search',
        tooltip: searchLabel,
        ariaLabel: searchLabel,
        section: 'top' as const,
        order: 10,
        render: ({ disabled }) => (
          <Tooltip content={searchLabel} position={tooltipPosition} offset={12} arrow portalTarget={document.body}>
            <Popover
              position={tooltipPosition}
              withArrow
              shadow="md"
              offset={8}
              opened={viewer.isSearchInterfaceVisible}
              onClose={viewer.searchInterfaceActions.close}
            >
              <Popover.Target>
                <div style={{ display: 'inline-flex' }}>
                  <ActionIcon
                    variant="subtle"
                    radius="md"
                    className="right-rail-icon"
                    disabled={disabled}
                    aria-label={searchLabel}
                    onClick={viewer.searchInterfaceActions.toggle}
                  >
                    <LocalIcon icon="search" width="1.5rem" height="1.5rem" />
                  </ActionIcon>
                </div>
              </Popover.Target>
              <Popover.Dropdown>
                <div style={{ minWidth: '20rem' }}>
                  <SearchInterface visible={viewer.isSearchInterfaceVisible} onClose={viewer.searchInterfaceActions.close} />
                </div>
              </Popover.Dropdown>
            </Popover>
          </Tooltip>
        )
      },
      {
        id: 'viewer-pan-mode',
        tooltip: panLabel,
        ariaLabel: panLabel,
        section: 'top' as const,
        order: 20,
        render: ({ disabled }) => (
          <Tooltip content={panLabel} position={tooltipPosition} offset={12} arrow portalTarget={document.body}>
            <ActionIcon
              variant={isPanning ? 'default' : 'subtle'}
              color={undefined}
              radius="md"
              className="right-rail-icon"
              onClick={() => {
                viewer.panActions.togglePan();
                setIsPanning(prev => !prev);
              }}
              disabled={disabled}
              style={isPanning ? { backgroundColor: 'var(--right-rail-pan-active-bg)' } : undefined}
            >
              <LocalIcon icon="pan-tool-rounded" width="1.5rem" height="1.5rem" />
            </ActionIcon>
          </Tooltip>
        )
      },
      {
        id: 'viewer-rotate-left',
        icon: <LocalIcon icon="rotate-left" width="1.5rem" height="1.5rem" />,
        tooltip: rotateLeftLabel,
        ariaLabel: rotateLeftLabel,
        section: 'top' as const,
        order: 30,
        onClick: () => {
          viewer.rotationActions.rotateBackward();
        }
      },
      {
        id: 'viewer-rotate-right',
        icon: <LocalIcon icon="rotate-right" width="1.5rem" height="1.5rem" />,
        tooltip: rotateRightLabel,
        ariaLabel: rotateRightLabel,
        section: 'top' as const,
        order: 40,
        onClick: () => {
          viewer.rotationActions.rotateForward();
        }
      },
      {
        id: 'viewer-toggle-sidebar',
        icon: <LocalIcon icon="view-list" width="1.5rem" height="1.5rem" />,
        tooltip: sidebarLabel,
        ariaLabel: sidebarLabel,
        section: 'top' as const,
        order: 50,
        onClick: () => {
          viewer.toggleThumbnailSidebar();
        }
      },
      {
        id: 'viewer-toggle-bookmarks',
        icon: <LocalIcon icon="bookmark-add-rounded" width="1.5rem" height="1.5rem" />,
        tooltip: bookmarkLabel,
        ariaLabel: bookmarkLabel,
        section: 'top' as const,
        order: 55,
        onClick: () => {
          viewer.toggleBookmarkSidebar();
        }
      },
      {
        id: 'viewer-print',
        icon: <LocalIcon icon="print" width="1.5rem" height="1.5rem" />,
        tooltip: printLabel,
        ariaLabel: printLabel,
        section: 'top' as const,
        order: 56,
        onClick: () => {
          viewer.printActions.print();
        }
      },
      {
        id: 'viewer-annotation-controls',
        section: 'top' as const,
        order: 60,
        render: ({ disabled }) => (
          <ViewerAnnotationControls currentView="viewer" disabled={disabled} />
        )
      }
    ];
  }, [t, i18n.language, viewer, isPanning, searchLabel, panLabel, rotateLeftLabel, rotateRightLabel, sidebarLabel, bookmarkLabel, printLabel, tooltipPosition]);

  useRightRailButtons(viewerButtons);
}
