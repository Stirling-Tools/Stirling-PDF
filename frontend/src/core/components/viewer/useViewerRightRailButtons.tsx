import { useMemo, useState, useEffect } from 'react';
import { ActionIcon, Popover } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { useRightRailButtons, RightRailButtonWithAction } from '@app/hooks/useRightRailButtons';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { SearchInterface } from '@app/components/viewer/SearchInterface';
import ViewerAnnotationControls from '@app/components/shared/rightRail/ViewerAnnotationControls';

export function useViewerRightRailButtons() {
  const { t } = useTranslation();
  const viewer = useViewer();
  const [isPanning, setIsPanning] = useState<boolean>(() => viewer.getPanState()?.isPanning ?? false);
  const [redactionActiveType, setRedactionActiveType] = useState<'text' | 'area' | null>(() => {
    const state = viewer.getRedactionState();
    return (state?.activeType as 'text' | 'area' | null) ?? null;
  });
  const { actions: navActions } = useNavigationActions();
  const { setLeftPanelView } = useToolWorkflow();

  // Subscribe to redaction state changes to update button highlight
  useEffect(() => {
    viewer.registerImmediateRedactionModeUpdate((mode) => {
      setRedactionActiveType(mode);
    });
  }, [viewer]);

  // Lift i18n labels out of memo for clarity
  const searchLabel = t('rightRail.search', 'Search PDF');
  const panLabel = t('rightRail.panMode', 'Pan Mode');
  const rotateLeftLabel = t('rightRail.rotateLeft', 'Rotate Left');
  const rotateRightLabel = t('rightRail.rotateRight', 'Rotate Right');
  const sidebarLabel = t('rightRail.toggleSidebar', 'Toggle Sidebar');

  const viewerButtons = useMemo<RightRailButtonWithAction[]>(() => {
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
                try { (viewer as any).redactionActions?.clearMode?.(); } catch {}
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
      // Removed rotate buttons from right rail (now in bottom toolbar)
      {
        id: 'viewer-redact',
        tooltip: t('rightRail.redact', 'Manual Redaction'),
        ariaLabel: t('rightRail.redact', 'Manual Redaction'),
        section: 'top' as const,
        order: 35,
        render: ({ disabled }) => (
          <Tooltip content={t('rightRail.redact', 'Manual Redaction')} position="left" offset={12} arrow portalTarget={document.body}>
            <ActionIcon
              variant={redactionActiveType ? 'filled' : 'subtle'}
              color={redactionActiveType ? 'blue' : undefined}
              radius="md"
              className="right-rail-icon"
              onClick={() => {
                // Show redact tool on the left and keep current workbench (viewer)
                navActions.setSelectedTool('redact');
                setLeftPanelView('toolContent');
                // Always ensure area selection is active (don't toggle off)
                const currentMode = viewer.getRedactionState()?.activeType;
                if (!currentMode) {
                  viewer.redactionActions.activateArea();
                }
              }}
              disabled={disabled}
            >
              <LocalIcon icon="visibility-off-rounded" width="1.5rem" height="1.5rem" />
            </ActionIcon>
          </Tooltip>
        )
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
  }, [t, viewer, isPanning, redactionActiveType, searchLabel, panLabel, rotateLeftLabel, rotateRightLabel, sidebarLabel, navActions, setLeftPanelView]);

  useRightRailButtons(viewerButtons);
}
