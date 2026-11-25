import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { type TooltipProps } from "@editor/components/shared/Tooltip";
import { BarButton } from "@editor/components/viewer/ViewerBarControls";
import { ViewerContext } from "@editor/contexts/ViewerContext";
import { useSignature } from "@editor/contexts/SignatureContext";
import {
  useAllFiles,
  useFileSelectors,
  useFileContext,
} from "@editor/contexts/FileContext";
import { createStirlingFilesAndStubs } from "@editor/services/fileStubHelpers";
import {
  useNavigationState,
  useNavigationGuard,
  useNavigationActions,
} from "@editor/contexts/NavigationContext";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import {
  useRedactionMode,
  useRedaction,
} from "@editor/contexts/RedactionContext";
import {
  defaultParameters,
  RedactParameters,
} from "@editor/hooks/tools/redact/useRedactParameters";
import { RedactionMode } from "@embedpdf/plugin-redaction";

interface ViewerAnnotationControlsProps {
  currentView: string;
  disabled?: boolean;
  tooltipPosition?: TooltipProps["position"];
}

export default function ViewerAnnotationControls({
  currentView,
  disabled = false,
  tooltipPosition,
}: ViewerAnnotationControlsProps) {
  const { t } = useTranslation();
  const { setLeftPanelView } = useToolWorkflow();

  // Viewer context for PDF controls - safely handle when not available
  const viewerContext = React.useContext(ViewerContext);

  // Signature context for accessing drawing API
  const { historyApiRef } = useSignature();

  // File state for save functionality
  const selectors = useFileSelectors();
  const { files: activeFiles, fileIds } = useAllFiles();
  const { actions: fileActions } = useFileContext();

  // Check if we're in sign mode or redaction mode
  const { selectedTool } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const isSignMode = selectedTool === "sign";
  const isRedactMode = selectedTool === "redact";

  // Get redaction pending state and navigation guard
  const { isRedacting: _isRedacting } = useRedactionMode();
  const { requestNavigation, setHasUnsavedChanges } = useNavigationGuard();
  const {
    setRedactionMode,
    activateRedact,
    deactivateRedact,
    setRedactionConfig,
    setRedactionsApplied,
    redactionApiRef,
    setActiveType,
  } = useRedaction();

  // Persist annotations to file if there are unsaved changes
  const saveAnnotationsIfNeeded = async () => {
    if (
      !viewerContext?.exportActions?.saveAsCopy ||
      currentView !== "viewer" ||
      !historyApiRef?.current?.canUndo()
    )
      return;
    if (activeFiles.length === 0 || fileIds.length === 0) return;

    try {
      const arrayBuffer = await viewerContext.exportActions.saveAsCopy();
      if (!arrayBuffer) return;

      const file = new File([new Blob([arrayBuffer])], activeFiles[0].name, {
        type: "application/pdf",
      });
      const parentStub = selectors.getStirlingFileStub(fileIds[0]);
      if (!parentStub) return;

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [file],
        parentStub,
        "redact",
      );
      await fileActions.consumeFiles([fileIds[0]], stirlingFiles, stubs);

      // Clear unsaved changes flags after successful save
      setHasUnsavedChanges(false);
      setRedactionsApplied(false);
    } catch (error) {
      console.error("Error auto-saving annotations before redaction:", error);
    }
  };

  const exitRedactionMode = useCallback(() => {
    navActions.setToolAndWorkbench(null, "viewer");
    setLeftPanelView("toolPicker");
    setRedactionMode(false);
    setActiveType(null);
    deactivateRedact();
  }, [
    navActions,
    setLeftPanelView,
    setRedactionMode,
    setActiveType,
    deactivateRedact,
  ]);

  // Handle redaction mode toggle
  const handleRedactionToggle = async () => {
    if (isRedactMode) {
      exitRedactionMode();
    } else {
      const hasAnnotationChanges = historyApiRef?.current?.canUndo() ?? false;

      const enterRedactionMode = async () => {
        await saveAnnotationsIfNeeded();

        const manualConfig: RedactParameters = {
          ...defaultParameters,
          mode: "manual",
        };
        setRedactionConfig(manualConfig);

        navActions.setToolAndWorkbench("redact", "viewer");

        setLeftPanelView("toolContent");

        setRedactionMode(true);
        setTimeout(() => {
          const currentType = redactionApiRef.current?.getActiveType?.();
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

  // NOTE: This early return is placed AFTER all hooks to satisfy React's rules of hooks
  if (isSignMode) {
    return null;
  }

  const redactLabel = t("workbenchBar.redact", "Redact");
  return (
    <BarButton
      icon="file-x"
      label={redactLabel}
      tooltipPosition={tooltipPosition}
      active={isRedactMode}
      hint={
        isRedactMode
          ? t("workbenchBar.exitRedaction", "Exit Redaction Mode")
          : undefined
      }
      onClick={handleRedactionToggle}
      disabled={disabled || currentView !== "viewer"}
    />
  );
}
