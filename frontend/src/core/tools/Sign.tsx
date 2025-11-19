import { useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useSignParameters } from "@app/hooks/tools/sign/useSignParameters";
import { useSignOperation } from "@app/hooks/tools/sign/useSignOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import SignSettings from "@app/components/tools/sign/SignSettings";
import { useNavigation } from "@app/contexts/NavigationContext";
import { useSignature } from "@app/contexts/SignatureContext";
import { useFileContext } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { flattenSignatures } from "@app/utils/signatureFlattening";

const Sign = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { setWorkbench } = useNavigation();
  const { setSignatureConfig, activateDrawMode, activateSignaturePlacementMode, deactivateDrawMode, updateDrawSettings, undo, redo, signatureApiRef, getImageData, setSignaturesApplied } = useSignature();
  const { consumeFiles, selectors } = useFileContext();
  const { exportActions, getScrollState, activeFileIndex, setActiveFileIndex } = useViewer();
  const { setHasUnsavedChanges, unregisterUnsavedChangesChecker } = useNavigation();

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

  const handleDeactivateSignature = useCallback(() => {
    activeModeRef.current = null;
    deactivateDrawMode();
  }, [deactivateDrawMode]);

  const base = useBaseTool(
    'sign',
    useSignParameters,
    useSignOperation,
    props
  );

  const hasOpenedViewer = useRef(false);

  // Open viewer when files are selected (only once)
  useEffect(() => {
    if (base.selectedFiles.length > 0 && !hasOpenedViewer.current) {
      setWorkbench('viewer');
      hasOpenedViewer.current = true;
    }
  }, [base.selectedFiles.length, setWorkbench]);



  // Sync signature configuration with context
  useEffect(() => {
    setSignatureConfig(base.params.parameters);
  }, [base.params.parameters, setSignatureConfig]);

  // Save signed files to the system - apply signatures using EmbedPDF and replace original
  const handleSaveToSystem = useCallback(async () => {
    try {
      // Unregister unsaved changes checker to prevent warning during apply
      unregisterUnsavedChangesChecker();
      setHasUnsavedChanges(false);

      // Get the original file from FileContext using activeFileIndex
      // The viewer displays files from FileContext, not from base.selectedFiles
      const allFiles = selectors.getFiles();
      const fileIndex = activeFileIndex < allFiles.length ? activeFileIndex : 0;
      const originalFile = allFiles[fileIndex];

      if (!originalFile) {
        console.error('No file available to replace');
        return;
      }

      // Use the signature flattening utility
      const flattenResult = await flattenSignatures({
        signatureApiRef,
        getImageData,
        exportActions,
        selectors,
        originalFile,
        getScrollState,
        activeFileIndex
      });

      if (flattenResult) {
        // Now consume the files - this triggers the viewer reload
        await consumeFiles(
          flattenResult.inputFileIds,
          [flattenResult.outputStirlingFile],
          [flattenResult.outputStub]
        );

        // According to FileReducer.processFileSwap, new files are inserted at the beginning
        // So the new file will be at index 0
        setActiveFileIndex(0);

        // Mark signatures as applied
        setSignaturesApplied(true);

        // Deactivate signature placement mode after everything completes
        handleDeactivateSignature();

        const hasSignatureReady = (() => {
          const params = base.params.parameters;
          switch (params.signatureType) {
            case 'canvas':
            case 'image':
              return Boolean(params.signatureData);
            case 'text':
              return Boolean(params.signerName && params.signerName.trim() !== '');
            default:
              return false;
          }
        })();

        if (hasSignatureReady) {
          if (typeof window !== 'undefined') {
            // TODO: Ideally, we should trigger handleActivateSignaturePlacement when the viewer is ready.
            // However, due to current architectural constraints, we use a 150ms delay to allow the viewer to reload.
            // This value was empirically determined to be sufficient for most environments, but should be revisited.
            window.setTimeout(() => {
              handleActivateSignaturePlacement();
            }, 150);
          } else {
            handleActivateSignaturePlacement();
          }
        }

        // File has been consumed - viewer should reload automatically via key prop
      } else {
        console.error('Signature flattening failed');
      }
    } catch (error) {
      console.error('Error saving signed document:', error);
    }
  }, [exportActions, base.selectedFiles, base.params.parameters, selectors, consumeFiles, signatureApiRef, getImageData, setWorkbench, activateDrawMode, setSignaturesApplied, getScrollState, handleDeactivateSignature, handleActivateSignaturePlacement, setHasUnsavedChanges, unregisterUnsavedChangesChecker, activeFileIndex, setActiveFileIndex]);

  const getSteps = () => {
    const steps = [];

    // Step 1: Signature Configuration - Only visible when file is loaded
    if (base.selectedFiles.length > 0) {
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
            onDeactivateSignature={handleDeactivateSignature}
            onUpdateDrawSettings={updateDrawSettings}
            onUndo={undo}
            onRedo={redo}
            onSave={handleSaveToSystem}
          />
        ),
      });
    }

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
