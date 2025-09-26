import { useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { useSignParameters } from "../hooks/tools/sign/useSignParameters";
import { useSignOperation } from "../hooks/tools/sign/useSignOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";
import SignSettings from "../components/tools/sign/SignSettings";
import { useNavigation } from "../contexts/NavigationContext";
import { useSignature } from "../contexts/SignatureContext";
import { useFileContext } from "../contexts/FileContext";
import { useViewer } from "../contexts/ViewerContext";
import { flattenSignatures } from "../utils/signatureFlattening";

const Sign = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { setWorkbench } = useNavigation();
  const { setSignatureConfig, activateDrawMode, activateSignaturePlacementMode, deactivateDrawMode, updateDrawSettings, undo, redo, signatureApiRef, getImageData, setSignaturesApplied } = useSignature();
  const { consumeFiles, selectors, actions } = useFileContext();
  const { exportActions, getScrollState } = useViewer();

  // Track which signature mode was active for reactivation after save
  const activeModeRef = useRef<'draw' | 'placement' | null>(null);

  // Single handler that activates placement mode
  const handleSignaturePlacement = useCallback(() => {
    activateSignaturePlacementMode();
  }, [activateSignaturePlacementMode]);

  // Memoized callbacks for SignSettings to prevent infinite loops
  const handleActivateDrawMode = useCallback(() => {
    activeModeRef.current = 'draw';
    activateDrawMode();
  }, [activateDrawMode]);

  const handleActivateSignaturePlacement = useCallback(() => {
    activeModeRef.current = 'placement';
    handleSignaturePlacement();
  }, [handleSignaturePlacement]);

  const base = useBaseTool(
    'sign',
    useSignParameters,
    useSignOperation,
    props
  );

  // Open viewer when files are selected
  useEffect(() => {
    if (base.selectedFiles.length > 0) {
      setWorkbench('viewer');
    }
  }, [base.selectedFiles.length, setWorkbench]);


  // Sync signature configuration with context
  useEffect(() => {
    setSignatureConfig(base.params.parameters);
  }, [base.params.parameters, setSignatureConfig]);

  // Save signed files to the system - apply signatures using EmbedPDF and replace original
  const handleSaveToSystem = useCallback(async () => {
    try {
      // Get the original file
      let originalFile = null;
      if (base.selectedFiles.length > 0) {
        originalFile = base.selectedFiles[0];
      } else {
        const allFileIds = selectors.getAllFileIds();
        if (allFileIds.length > 0) {
          const stirlingFile = selectors.getFile(allFileIds[0]);
          if (stirlingFile) {
            originalFile = stirlingFile;
          }
        }
      }

      if (!originalFile) {
        console.error('No file available to replace');
        return;
      }

      // Use the signature flattening utility
      const success = await flattenSignatures({
        signatureApiRef,
        getImageData,
        exportActions,
        selectors,
        consumeFiles,
        originalFile,
        getScrollState
      });

      if (success) {
        console.log('✓ Signature flattening completed successfully');

        // Mark signatures as applied
        setSignaturesApplied(true);

        // Refresh the file context to reload the flattened PDF in viewer
        setTimeout(() => {
          actions.refreshFileContext();

          // Reactivate the signature mode that was active before save
          if (activeModeRef.current === 'draw') {
            activateDrawMode();
          } else if (activeModeRef.current === 'placement') {
            handleSignaturePlacement();
          }
        }, 200);
      } else {
        console.error('Signature flattening failed');
      }
    } catch (error) {
      console.error('Error saving signed document:', error);
    }
  }, [exportActions, base.selectedFiles, selectors, consumeFiles, signatureApiRef, getImageData, actions, activateDrawMode, handleSignaturePlacement, setSignaturesApplied]);

  const getSteps = () => {
    const steps = [];

    // Step 1: Signature Configuration - Always visible
    steps.push({
      title: t('sign.steps.configure', 'Configure Signature'),
      isCollapsed: false,
      onCollapsedClick: undefined,
      content: (
        <SignSettings
          parameters={base.params.parameters}
          onParameterChange={base.params.updateParameter}
          disabled={base.endpointLoading}
          onActivateDrawMode={handleActivateDrawMode}
          onActivateSignaturePlacement={handleActivateSignaturePlacement}
          onDeactivateSignature={deactivateDrawMode}
          onUpdateDrawSettings={updateDrawSettings}
          onUndo={undo}
          onRedo={redo}
          onSave={handleSaveToSystem}
        />
      ),
    });

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.operation.files.length > 0,
    },
    steps: getSteps(),
    review: {
      isVisible: false, // Hide review section - save moved to configure section
      operation: base.operation,
      title: t('sign.results.title', 'Signature Results'),
      onFileClick: base.handleThumbnailClick,
      onUndo: () => {},
    },
    forceStepNumbers: true,
  });
};

// Add the required static methods for automation
Sign.tool = () => useSignOperation;
Sign.getDefaultParameters = () => ({
  signatureType: 'canvas',
  reason: 'Document signing',
  location: 'Digital',
  signerName: '',
});

export default Sign as ToolComponent;