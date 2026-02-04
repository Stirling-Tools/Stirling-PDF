import React, { useCallback } from 'react';
import { ActionIcon } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { ViewerContext } from '@app/contexts/ViewerContext';
import { useSignature } from '@app/contexts/SignatureContext';
import { useFileState, useFileContext } from '@app/contexts/FileContext';
import { createStirlingFilesAndStubs } from '@app/services/fileStubHelpers';
import { useNavigationState, useNavigationGuard, useNavigationActions } from '@app/contexts/NavigationContext';
import { useSidebarContext } from '@app/contexts/SidebarContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useRightRailTooltipSide } from '@app/hooks/useRightRailTooltipSide';
import { useRedactionMode, useRedaction } from '@app/contexts/RedactionContext';
import { defaultParameters, RedactParameters } from '@app/hooks/tools/redact/useRedactParameters';
import { RedactionMode } from '@embedpdf/plugin-redaction';

interface ViewerAnnotationControlsProps {
  currentView: string;
  disabled?: boolean;
}

export default function ViewerAnnotationControls({ currentView, disabled = false }: ViewerAnnotationControlsProps) {
  const { t } = useTranslation();
  const { sidebarRefs } = useSidebarContext();
  const { setLeftPanelView, setSidebarsVisible } = useToolWorkflow();
  const { position: tooltipPosition, offset: tooltipOffset } = useRightRailTooltipSide(sidebarRefs);

  // Viewer context for PDF controls - safely handle when not available
  const viewerContext = React.useContext(ViewerContext);

  // Signature context for accessing drawing API
  const { historyApiRef, isPlacementMode } = useSignature();

  // File state for save functionality
  const { state, selectors } = useFileState();
  const { actions: fileActions } = useFileContext();
  const activeFiles = selectors.getFiles();

  // Check if we're in sign mode or redaction mode
  const { selectedTool } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const isSignMode = selectedTool === 'sign';
  const isRedactMode = selectedTool === 'redact';
  
  // Get redaction pending state and navigation guard
  const { isRedacting: _isRedacting } = useRedactionMode();
  const { requestNavigation, setHasUnsavedChanges } = useNavigationGuard();
  const { setRedactionMode, activateRedact, setRedactionConfig, setRedactionsApplied, redactionApiRef, setActiveType } = useRedaction();


  // Check if we're in any annotation tool that should disable the toggle
  const isInAnnotationTool = selectedTool === 'annotate' || selectedTool === 'sign' || selectedTool === 'addImage' || selectedTool === 'addText';

  // Check if we're on annotate tool to highlight the button
  const isAnnotateActive = selectedTool === 'annotate';
  const annotationsHidden = viewerContext ? !viewerContext.isAnnotationsVisible : false;

  // Persist annotations to file if there are unsaved changes
  const saveAnnotationsIfNeeded = async () => {
    if (!viewerContext?.exportActions?.saveAsCopy || currentView !== 'viewer' || !historyApiRef?.current?.canUndo()) return;
    if (activeFiles.length === 0 || state.files.ids.length === 0) return;

    try {
      const arrayBuffer = await viewerContext.exportActions.saveAsCopy();
      if (!arrayBuffer) return;

      const file = new File([new Blob([arrayBuffer])], activeFiles[0].name, { type: 'application/pdf' });
      const parentStub = selectors.getStirlingFileStub(state.files.ids[0]);
      if (!parentStub) return;

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs([file], parentStub, 'redact');
      await fileActions.consumeFiles([state.files.ids[0]], stirlingFiles, stubs);
      
      // Clear unsaved changes flags after successful save
      setHasUnsavedChanges(false);
      setRedactionsApplied(false);
    } catch (error) {
      console.error('Error auto-saving annotations before redaction:', error);
    }
  };

  const exitRedactionMode = useCallback(() => {
    navActions.setToolAndWorkbench(null, 'viewer');
    setLeftPanelView('toolPicker');
    setRedactionMode(false);
    setActiveType(null);
  }, [navActions, setLeftPanelView, setRedactionMode, setActiveType]);

  // Handle redaction mode toggle
  const handleRedactionToggle = async () => {
    if (isRedactMode) {
      // Exit redaction mode
      exitRedactionMode();
    } else {
      // Check for unsaved annotation changes
      const hasAnnotationChanges = historyApiRef?.current?.canUndo() ?? false;

      const enterRedactionMode = async () => {
        await saveAnnotationsIfNeeded();

        // Set redaction config to manual mode when opening from viewer
        const manualConfig: RedactParameters = {
          ...defaultParameters,
          mode: 'manual',
        };
        setRedactionConfig(manualConfig);

        // Set tool and keep viewer workbench
        navActions.setToolAndWorkbench('redact', 'viewer');

        // Ensure sidebars are visible and open tool content
        setSidebarsVisible(true);
        setLeftPanelView('toolContent');

        setRedactionMode(true);
        // Activate unified redact mode after a short delay
        setTimeout(() => {
          const currentType = redactionApiRef.current?.getActiveType?.();
          // Use unified RedactionMode.Redact from embedPDF v2.4.1
          if (currentType !== RedactionMode.Redact) {
            activateRedact();
          }
        }, 200);
      };

      if (hasAnnotationChanges) {
        requestNavigation(enterRedactionMode);
      } else {
        await enterRedactionMode();
      }
    }
  };

  // Don't show any annotation controls in sign mode
  // NOTE: This early return is placed AFTER all hooks to satisfy React's rules of hooks
  if (isSignMode) {
    return null;
  }

  return (
    <>
      {/* Redaction Mode Toggle */}
      <Tooltip content={isRedactMode ? t('rightRail.exitRedaction', 'Exit Redaction Mode') : t('rightRail.redact', 'Redact')} position={tooltipPosition} offset={tooltipOffset} arrow portalTarget={document.body}>
        <ActionIcon
          variant={isRedactMode ? 'filled' : 'subtle'}
          color={isRedactMode ? 'blue' : undefined}
          radius="md"
          className="right-rail-icon"
          onClick={handleRedactionToggle}
          disabled={disabled || currentView !== 'viewer'}
        >
          <LocalIcon
            icon="scan-delete-rounded"
            width="1.5rem"
            height="1.5rem"
          />
        </ActionIcon>
      </Tooltip>

      {/* Annotation Visibility Toggle */}
      <Tooltip content={t('rightRail.toggleAnnotations', 'Toggle Annotations Visibility')} position={tooltipPosition} offset={tooltipOffset} arrow portalTarget={document.body}>
        <ActionIcon
          variant={annotationsHidden ? "filled" : "subtle"}
          color={annotationsHidden ? "blue" : undefined}
          radius="md"
          className="right-rail-icon"
          onClick={() => {
            viewerContext?.toggleAnnotationsVisibility();
          }}
          disabled={disabled || currentView !== 'viewer' || (isInAnnotationTool && !isAnnotateActive) || isPlacementMode}
          data-active={annotationsHidden ? 'true' : undefined}
          aria-pressed={annotationsHidden}
        >
          <LocalIcon
            icon={viewerContext?.isAnnotationsVisible ? "visibility" : "preview-off-rounded"}
            width="1.5rem"
            height="1.5rem"
          />
        </ActionIcon>
      </Tooltip>

    </>
  );
}
