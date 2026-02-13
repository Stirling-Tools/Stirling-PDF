import { useMemo, useState, useEffect, useCallback } from 'react';
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
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationState, useNavigationGuard } from '@app/contexts/NavigationContext';
import { BASE_PATH, withBasePath } from '@app/constants/app';
import { useRedaction, useRedactionMode } from '@app/contexts/RedactionContext';

export function useViewerRightRailButtons() {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const { isThumbnailSidebarVisible, isBookmarkSidebarVisible, isAttachmentSidebarVisible, isSearchInterfaceVisible, registerImmediatePanUpdate } = viewer;
  const [isPanning, setIsPanning] = useState<boolean>(() => viewer.getPanState()?.isPanning ?? false);
  const { sidebarRefs } = useSidebarContext();
  const { position: tooltipPosition } = useRightRailTooltipSide(sidebarRefs, 12);
  const { handleToolSelect } = useToolWorkflow();
  const { selectedTool } = useNavigationState();
  const { requestNavigation } = useNavigationGuard();
  const { redactionsApplied, activeType: redactionActiveType } = useRedaction();
  const { pendingCount } = useRedactionMode();

  // Subscribe to immediate pan updates so button state stays in sync with actual pan state
  // This handles cases where annotation/redaction tools disable pan mode
  useEffect(() => {
    return registerImmediatePanUpdate((newIsPanning) => {
      setIsPanning(newIsPanning);
    });
  }, [registerImmediatePanUpdate]);

  const stripBasePath = useCallback((path: string) => {
    if (BASE_PATH && path.startsWith(BASE_PATH)) {
      return path.slice(BASE_PATH.length) || '/';
    }
    return path;
  }, []);

  const isAnnotationsPath = useCallback(() => {
    const cleanPath = stripBasePath(window.location.pathname).toLowerCase();
    return cleanPath === '/annotations' || cleanPath.endsWith('/annotations');
  }, [stripBasePath]);

  const [isAnnotationsActive, setIsAnnotationsActive] = useState<boolean>(() => isAnnotationsPath());

  // Update isAnnotationsActive based on selected tool
  useEffect(() => {
    if (selectedTool === 'annotate') {
      setIsAnnotationsActive(true);
    } else if (selectedTool === 'redact') {
      setIsAnnotationsActive(false);
    } else {
      setIsAnnotationsActive(isAnnotationsPath());
    }
  }, [selectedTool, isAnnotationsPath]);

  useEffect(() => {
    const handlePopState = () => setIsAnnotationsActive(isAnnotationsPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAnnotationsPath]);

  // Lift i18n labels out of memo for clarity
  const searchLabel = t('rightRail.search', 'Search PDF');
  const panLabel = t('rightRail.panMode', 'Pan Mode');
  const applyRedactionsLabel = t('rightRail.applyRedactionsFirst', 'Apply redactions first');
  const rotateLeftLabel = t('rightRail.rotateLeft', 'Rotate Left');
  const rotateRightLabel = t('rightRail.rotateRight', 'Rotate Right');
  const sidebarLabel = t('rightRail.toggleSidebar', 'Toggle Sidebar');
  const bookmarkLabel = t('rightRail.toggleBookmarks', 'Toggle Bookmarks');
  const attachmentLabel = t('rightRail.toggleAttachments', 'Toggle Attachments');
  const printLabel = t('rightRail.print', 'Print PDF');
  const annotationsLabel = t('rightRail.annotations', 'Annotations');

  const viewerButtons = useMemo<RightRailButtonWithAction[]>(() => {
    const buttons: RightRailButtonWithAction[] = [
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
              opened={isSearchInterfaceVisible}
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
                  <SearchInterface visible={isSearchInterfaceVisible} onClose={viewer.searchInterfaceActions.close} />
                </div>
              </Popover.Dropdown>
            </Popover>
          </Tooltip>
        )
      },
      {
        id: 'viewer-pan-mode',
        icon: <LocalIcon icon="pan-tool-rounded" width="1.5rem" height="1.5rem" />,
        tooltip: (!isPanning && pendingCount > 0 && redactionActiveType !== null) ? applyRedactionsLabel : panLabel,
        ariaLabel: (!isPanning && pendingCount > 0 && redactionActiveType !== null) ? applyRedactionsLabel : panLabel,
        section: 'top' as const,
        order: 20,
        active: isPanning,
        disabled: !isPanning && pendingCount > 0 && redactionActiveType !== null,
        onClick: () => {
          viewer.panActions.togglePan();
          setIsPanning(prev => !prev);
        },
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
        active: isThumbnailSidebarVisible,
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
        active: isBookmarkSidebarVisible,
        onClick: () => {
          viewer.toggleBookmarkSidebar();
        }
      },
      {
        id: 'viewer-toggle-attachments',
        icon: <LocalIcon icon="attachment-rounded" width="1.5rem" height="1.5rem" />,
        tooltip: attachmentLabel,
        ariaLabel: attachmentLabel,
        section: 'top' as const,
        order: 56,
        active: isAttachmentSidebarVisible,
        onClick: () => {
          viewer.toggleAttachmentSidebar();
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
        id: 'viewer-annotations',
        tooltip: annotationsLabel,
        ariaLabel: annotationsLabel,
        section: 'top' as const,
        order: 58,
        active: isAnnotationsActive,
        render: ({ disabled }) => (
          <Tooltip content={annotationsLabel} position={tooltipPosition} offset={12} arrow portalTarget={document.body}>
            <ActionIcon
              variant={isAnnotationsActive ? 'filled' : 'subtle'}
              radius="md"
              className="right-rail-icon"
              onClick={() => {
                if (disabled || isAnnotationsActive) return;

                // Check for unsaved redaction changes (pending or applied)
                const hasRedactionChanges = pendingCount > 0 || redactionsApplied;

                const switchToAnnotations = () => {
                  const targetPath = withBasePath('/annotations');
                  if (window.location.pathname !== targetPath) {
                    window.history.pushState(null, '', targetPath);
                  }
                  setIsAnnotationsActive(true);
                  handleToolSelect('annotate');
                };

                if (hasRedactionChanges) {
                  requestNavigation(switchToAnnotations);
                } else {
                  switchToAnnotations();
                }
              }}
              disabled={disabled}
              aria-pressed={isAnnotationsActive}
              color={isAnnotationsActive ? 'blue' : undefined}
            >
              <LocalIcon icon="edit" width="1.5rem" height="1.5rem" />
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
      },
    ];

    // Optional: Save button for annotations (always registered when this hook is used
    // with a save handler; uses a ref to avoid infinite re-registration loops).
    return buttons;
  }, [
    t,
    i18n.language,
    viewer,
    isThumbnailSidebarVisible,
    isBookmarkSidebarVisible,
    isAttachmentSidebarVisible,
    isSearchInterfaceVisible,
    isPanning,
    searchLabel,
    panLabel,
    applyRedactionsLabel,
    rotateLeftLabel,
    rotateRightLabel,
    sidebarLabel,
    bookmarkLabel,
    attachmentLabel,
    printLabel,
    tooltipPosition,
    annotationsLabel,
    isAnnotationsActive,
    handleToolSelect,
    pendingCount,
    redactionActiveType,
  ]);

  useRightRailButtons(viewerButtons);
}
