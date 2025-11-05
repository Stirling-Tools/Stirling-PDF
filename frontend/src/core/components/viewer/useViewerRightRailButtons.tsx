import { useMemo, useState, useEffect, useRef } from 'react';
import { ActionIcon, Popover } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@app/contexts/ViewerContext';
import { useRightRailButtons, RightRailButtonWithAction } from '@app/hooks/useRightRailButtons';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { SearchInterface } from '@app/components/viewer/SearchInterface';
import ViewerAnnotationControls from '@app/components/shared/rightRail/ViewerAnnotationControls';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';

export function useViewerRightRailButtons() {
  const { t } = useTranslation();
  const viewer = useViewer();
  const { actions: navActions } = useNavigationActions();
  const { handleToolSelect } = useToolWorkflow();
  const { workbench, selectedTool } = useNavigationState();

  // Extract stable references to viewer methods to avoid re-renders from context changes
  const getToolModeRef = useRef(viewer.getToolMode);
  const registerToolModeListenerRef = useRef(viewer.registerToolModeListener);
  const unregisterToolModeListenerRef = useRef(viewer.unregisterToolModeListener);
  const setAnnotationModeRef = useRef(viewer.setAnnotationMode);
  const redactionActionsRef = useRef(viewer.redactionActions);
  const panActionsRef = useRef(viewer.panActions);
  const rotationActionsRef = useRef(viewer.rotationActions);
  const toggleThumbnailSidebarRef = useRef(viewer.toggleThumbnailSidebar);
  const triggerToolModeUpdateRef = useRef(viewer.triggerToolModeUpdate);
  
  // Update refs when viewer context changes (but don't cause re-renders)
  useEffect(() => {
    getToolModeRef.current = viewer.getToolMode;
    registerToolModeListenerRef.current = viewer.registerToolModeListener;
    unregisterToolModeListenerRef.current = viewer.unregisterToolModeListener;
    setAnnotationModeRef.current = viewer.setAnnotationMode;
    redactionActionsRef.current = viewer.redactionActions;
    panActionsRef.current = viewer.panActions;
    rotationActionsRef.current = viewer.rotationActions;
    toggleThumbnailSidebarRef.current = viewer.toggleThumbnailSidebar;
    triggerToolModeUpdateRef.current = viewer.triggerToolModeUpdate;
  }, [viewer]);

  // Single source of truth for active tool mode (none | pan | redact | draw)
  const [activeMode, setActiveMode] = useState<'none' | 'pan' | 'redact' | 'draw'>(() => getToolModeRef.current());
  useEffect(() => {
    registerToolModeListenerRef.current((mode) => setActiveMode(mode));
    return () => unregisterToolModeListenerRef.current();
  }, []); // Empty deps - refs are stable

  // Memoize i18n labels to prevent re-renders
  const searchLabel = useMemo(() => t('rightRail.search', 'Search PDF'), [t]);
  const panLabel = useMemo(() => t('rightRail.panMode', 'Pan Mode'), [t]);
  const rotateLeftLabel = useMemo(() => t('rightRail.rotateLeft', 'Rotate Left'), [t]);
  const rotateRightLabel = useMemo(() => t('rightRail.rotateRight', 'Rotate Right'), [t]);
  const sidebarLabel = useMemo(() => t('rightRail.toggleSidebar', 'Toggle Sidebar'), [t]);
  const redactLabel = useMemo(() => t('rightRail.redact', 'Redact'), [t]);

  const isPanning = activeMode === 'pan';
  const isRedacting = activeMode === 'redact';

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
                // Entering pan should disable draw and redaction; leaving pan just toggles off
                if (!isPanning) {
                  try { setAnnotationModeRef.current(false); } catch {}
                  try { redactionActionsRef.current.deactivate(); } catch {}
                  const enable = () => {
                    try { panActionsRef.current.enablePan(); } catch {}
                    try { triggerToolModeUpdateRef.current(); } catch {}
                  };
                  if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
                    requestAnimationFrame(() => setTimeout(enable, 0));
                  } else {
                    setTimeout(enable, 0);
                  }
                } else {
                  try { panActionsRef.current.disablePan(); } catch {}
                  try { triggerToolModeUpdateRef.current(); } catch {}
                }
                // activeMode will update via listener
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
          rotationActionsRef.current.rotateBackward();
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
          rotationActionsRef.current.rotateForward();
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
          toggleThumbnailSidebarRef.current();
        }
      },
      {
        id: 'viewer-redaction',
        tooltip: redactLabel,
        ariaLabel: redactLabel,
        section: 'top' as const,
        order: 55,
        render: ({ disabled }) => (
          <Tooltip content={redactLabel} position="left" offset={12} arrow portalTarget={document.body}>
            <ActionIcon
              variant={isRedacting ? 'filled' : 'subtle'}
              color={isRedacting ? 'blue' : undefined}
              radius="md"
              className="right-rail-icon"
              onClick={() => {
                // Ensure the left sidebar opens the Redact tool in viewer with manual mode
                sessionStorage.setItem('redaction:init', 'manual');
                // Navigate to viewer with the redact tool if we're not already there
                if (workbench !== 'viewer' || selectedTool !== 'redact') {
                  handleToolSelect('redact' as any);
                }
                // Disable draw and pan when activating redaction
                try { setAnnotationModeRef.current(false); } catch {}
                try { panActionsRef.current.disablePan(); } catch {}
                // Activate last used manual mode inside viewer.
                // Defer to next frame to allow annotation plugin to fully release interaction.
                const last = (sessionStorage.getItem('redaction:lastManualType') as 'redactSelection' | 'marqueeRedact' | null) || 'redactSelection';
                const activate = () => {
                  if (last === 'marqueeRedact') {
                    redactionActionsRef.current.activateArea();
                  } else {
                    redactionActionsRef.current.activateText();
                  }
                  try { triggerToolModeUpdateRef.current(); } catch {}
                };
                if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
                  requestAnimationFrame(() => setTimeout(activate, 0));
                } else {
                  setTimeout(activate, 0);
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
        id: 'viewer-annotation-controls',
        section: 'top' as const,
        order: 60,
        render: ({ disabled }) => (
          <ViewerAnnotationControls currentView="viewer" disabled={disabled} />
        )
      }
    ];
  }, [activeMode, searchLabel, panLabel, rotateLeftLabel, rotateRightLabel, sidebarLabel, redactLabel, handleToolSelect, workbench, selectedTool, isPanning, isRedacting]);

  useRightRailButtons(viewerButtons);
}
