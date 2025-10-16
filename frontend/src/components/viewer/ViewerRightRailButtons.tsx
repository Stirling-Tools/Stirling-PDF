import { useMemo, useState } from 'react';
import { ActionIcon, Popover } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useViewer } from '../../contexts/ViewerContext';
import { useRightRailButtons, RightRailButtonWithAction } from '../../hooks/useRightRailButtons';
import LocalIcon from '../shared/LocalIcon';
import { Tooltip } from '../shared/Tooltip';
import { SearchInterface } from './SearchInterface';
import ViewerAnnotationControls from '../shared/rightRail/ViewerAnnotationControls';

const ViewerRightRailButtons = () => {
  const { t } = useTranslation();
  const viewer = useViewer();
  const [isPanning, setIsPanning] = useState<boolean>(() => viewer.getPanState()?.isPanning ?? false);

  const viewerButtons = useMemo<RightRailButtonWithAction[]>(() => {
    const searchLabel = typeof t === 'function' ? t('rightRail.search', 'Search PDF') : 'Search PDF';
    const panLabel = typeof t === 'function' ? t('rightRail.panMode', 'Pan Mode') : 'Pan Mode';
    const rotateLeftLabel = typeof t === 'function' ? t('rightRail.rotateLeft', 'Rotate Left') : 'Rotate Left';
    const rotateRightLabel = typeof t === 'function' ? t('rightRail.rotateRight', 'Rotate Right') : 'Rotate Right';
    const sidebarLabel = typeof t === 'function' ? t('rightRail.toggleSidebar', 'Toggle Sidebar') : 'Toggle Sidebar';

    return [
      {
        id: 'viewer-search',
        tooltip: searchLabel,
        ariaLabel: searchLabel,
        section: 'top' as const,
        order: 10,
        render: ({ disabled }) => (
          <Tooltip content={searchLabel} position="left" offset={12} arrow portalTarget={document.body}>
            <Popover position="left" withArrow shadow="md" offset={8}>
              <Popover.Target>
                <div style={{ display: 'inline-flex' }}>
                  <ActionIcon
                    variant="subtle"
                    radius="md"
                    className="right-rail-icon"
                    disabled={disabled}
                    aria-label={searchLabel}
                  >
                    <LocalIcon icon="search" width="1.5rem" height="1.5rem" />
                  </ActionIcon>
                </div>
              </Popover.Target>
              <Popover.Dropdown>
                <div style={{ minWidth: '20rem' }}>
                  <SearchInterface visible={true} onClose={() => {}} />
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
          <Tooltip content={panLabel} position="left" offset={12} arrow portalTarget={document.body}>
            <ActionIcon
              variant={isPanning ? 'filled' : 'subtle'}
              color={isPanning ? 'blue' : undefined}
              radius="md"
              className="right-rail-icon"
              onClick={() => {
                viewer.panActions.togglePan();
                setIsPanning(prev => !prev);
              }}
              disabled={disabled}
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
        id: 'viewer-annotation-controls',
        section: 'top' as const,
        order: 60,
        render: ({ disabled }) => (
          <ViewerAnnotationControls currentView="viewer" disabled={disabled} />
        )
      }
    ];
  }, [t, viewer, isPanning]);

  useRightRailButtons(viewerButtons);

  return null;
};

export default ViewerRightRailButtons;
