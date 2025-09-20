import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { useSignParameters } from "../hooks/tools/sign/useSignParameters";
import { useSignOperation } from "../hooks/tools/sign/useSignOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";
import SignSettings from "../components/tools/sign/SignSettings";
import { useNavigation } from "../contexts/NavigationContext";
import { useSignature } from "../contexts/SignatureContext";

const Sign = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { setWorkbench } = useNavigation();
  const { setSignatureConfig, activateDrawMode, activateSignaturePlacementMode, deactivateDrawMode } = useSignature();

  // Manual sync function
  const syncSignatureConfig = () => {
    setSignatureConfig(base.params.parameters);
  };

  // Single handler that syncs first
  const handleSignaturePlacement = () => {
    syncSignatureConfig();
    setTimeout(() => {
      activateSignaturePlacementMode();
    }, 100);
  };

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

  const getSteps = () => {
    const steps = [];

    // Step 1: Signature Configuration
    if (base.selectedFiles.length > 0 || base.operation.files.length > 0) {
      steps.push({
        title: t('sign.steps.configure', 'Configure Signature'),
        isCollapsed: base.operation.files.length > 0,
        onCollapsedClick: base.operation.files.length > 0 ? base.handleSettingsReset : undefined,
        content: (
          <SignSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
            onActivateDrawMode={activateDrawMode}
            onActivateSignaturePlacement={handleSignaturePlacement}
            onDeactivateSignature={deactivateDrawMode}
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
    executeButton: {
      text: t('sign.submit', 'Sign Document'),
      isVisible: base.operation.files.length === 0,
      loadingText: t('loading'),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || base.selectedFiles.length === 0 || !base.endpointEnabled,
    },
    review: {
      isVisible: base.operation.files.length > 0,
      operation: base.operation,
      title: t('sign.results.title', 'Signature Results'),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
    forceStepNumbers: true,
  });
};

// Add the required static methods for automation
Sign.tool = () => useSignOperation;
Sign.getDefaultParameters = () => ({
  signatureType: 'draw',
  reason: 'Document signing',
  location: 'Digital',
  signerName: '',
});

export default Sign as ToolComponent;