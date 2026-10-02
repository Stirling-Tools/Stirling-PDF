import { useEffect, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import SignSettings, {
  SignatureSource,
} from "@app/components/tools/sign/SignSettings";
import {
  DEFAULT_PARAMETERS,
  useSignParameters,
  SignParameters,
} from "@app/hooks/tools/sign/useSignParameters";
import { useSignOperation } from "@app/hooks/tools/sign/useSignOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { ToolId } from "@app/types/toolId";
import { useNavigation } from "@app/contexts/NavigationContext";
import { useSignature } from "@app/contexts/SignatureContext";
import { useFileContext } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { flattenSignatures } from "@app/utils/signatureFlattening";
import { SignatureWallet } from "@app/components/tools/sign/wallet/SignatureWallet";
import SharedSigningLauncher from "@app/components/shared/signing/SharedSigningLauncher";
import { SuggestedToolsSection } from "@app/components/tools/shared/SuggestedToolsSection";
import { useGroupSigningEnabled } from "@app/hooks/useGroupSigningEnabled";
import { alert } from "@app/components/toast";

export type StampToolConfig = {
  toolId: ToolId;
  translationScope?: string;
  allowedSignatureSources?: SignatureSource[];
  defaultSignatureSource?: SignatureSource;
  defaultSignatureType?: SignParameters["signatureType"];
  enableApplyAction?: boolean;
  enableSharedSigning?: boolean;
  settingsPanel?: "stamp" | "wallet";
};

const STAMP_TOOL_DEFAULT_SOURCES: SignatureSource[] = [
  "canvas",
  "image",
  "text",
  "saved",
];

export const createStampTool = (config: StampToolConfig) => {
  const {
    toolId,
    translationScope = toolId,
    allowedSignatureSources = STAMP_TOOL_DEFAULT_SOURCES,
    defaultSignatureSource,
    defaultSignatureType,
    enableApplyAction = false,
    enableSharedSigning = false,
    settingsPanel = "stamp",
  } = config;

  const StampTool = (props: BaseToolProps) => {
    const { t } = useTranslation();
    const translateTool = useCallback(
      (key: string, defaultValue: string) =>
        t(`${translationScope}.${key}`, defaultValue),
      [t, translationScope],
    );
    const { setWorkbench, setHasUnsavedChanges } = useNavigation();
    const {
      setSignatureConfig,
      activateDrawMode,
      activateSignaturePlacementMode,
      deactivateDrawMode,
      updateDrawSettings,
      undo,
      redo,
      signatureApiRef,
      getImageData,
      setSignaturesApplied,
      placedSignatures,
      setApplyingSignatures,
    } = useSignature();
    const { consumeFiles, selectors } = useFileContext();
    const {
      exportActions,
      getScrollState,
      activeFileIndex,
      setActiveFileIndex,
    } = useViewer();
    const groupSigningEnabled = useGroupSigningEnabled();
    const base = useBaseTool(
      toolId,
      useSignParameters,
      useSignOperation,
      props,
    );

    const allowedSignatureTypes = allowedSignatureSources.filter(
      (source): source is SignParameters["signatureType"] => source !== "saved",
    );
    const enforcedSignatureType =
      defaultSignatureType ??
      allowedSignatureTypes[0] ??
      DEFAULT_PARAMETERS.signatureType;

    useEffect(() => {
      if (
        !allowedSignatureTypes.includes(base.params.parameters.signatureType)
      ) {
        base.params.updateParameter("signatureType", enforcedSignatureType);
      }
    }, [
      allowedSignatureTypes,
      base.params.parameters.signatureType,
      base.params.updateParameter,
      enforcedSignatureType,
    ]);

    const hasOpenedViewer = useRef(false);
    const [hasApplied, setHasApplied] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const applyInFlightRef = useRef(false);
    const showSuggestions = settingsPanel === "stamp" || hasApplied;
    const activeModeRef = useRef<"draw" | "placement" | null>(null);

    const handleSignaturePlacement = useCallback(() => {
      activateSignaturePlacementMode();
    }, [activateSignaturePlacementMode]);

    const handleActivateDrawMode = useCallback(() => {
      activeModeRef.current = "draw";
      activateDrawMode();
    }, [activateDrawMode]);

    const handleActivateSignaturePlacement = useCallback(() => {
      activeModeRef.current = "placement";
      handleSignaturePlacement();
    }, [handleSignaturePlacement]);

    const handleDeactivateSignature = useCallback(() => {
      activeModeRef.current = null;
      deactivateDrawMode();
    }, [deactivateDrawMode]);

    useEffect(() => {
      if (base.selectedFiles.length > 0 && !hasOpenedViewer.current) {
        setWorkbench("viewer");
        hasOpenedViewer.current = true;
      }
    }, [base.selectedFiles.length, setWorkbench]);

    useEffect(() => {
      setSignatureConfig(base.params.parameters);
    }, [base.params.parameters, setSignatureConfig]);

    useEffect(() => {
      if (placedSignatures.length > 0) setHasUnsavedChanges(true);
    }, [placedSignatures, setHasUnsavedChanges]);

    const handleSaveToSystem = useCallback(async () => {
      if (applyInFlightRef.current) return;
      applyInFlightRef.current = true;
      setIsApplying(true);
      setApplyingSignatures(true);
      handleDeactivateSignature();
      try {
        const allFiles = selectors.getFiles();
        const fileIndex =
          activeFileIndex < allFiles.length ? activeFileIndex : 0;
        const originalFile = allFiles[fileIndex];

        if (!originalFile) {
          throw new Error("No file available to replace");
        }

        const flattenResult = await flattenSignatures({
          signatureApiRef,
          getImageData,
          exportActions,
          selectors,
          originalFile,
          getScrollState,
          activeFileIndex,
        });

        if (flattenResult) {
          await consumeFiles(
            flattenResult.inputFileIds,
            [flattenResult.outputStirlingFile],
            [flattenResult.outputStub],
          );

          setActiveFileIndex(0);
          setSignaturesApplied(true);
          setHasApplied(true);
          handleDeactivateSignature();
          setHasUnsavedChanges(false);
        } else {
          throw new Error("Signature flattening failed");
        }
      } catch (error) {
        console.error("Error saving signed document:", error);
        setHasUnsavedChanges(true);
        alert({
          alertType: "error",
          title: t(
            "sign.wallet.toast.applyFailed",
            "Could not apply signatures",
          ),
          body: t(
            "sign.wallet.toast.applyFailedBody",
            "Your signatures are still on the document. Try again.",
          ),
        });
      } finally {
        applyInFlightRef.current = false;
        setIsApplying(false);
        setApplyingSignatures(false);
      }
    }, [
      exportActions,
      base.selectedFiles,
      base.params.parameters,
      selectors,
      consumeFiles,
      signatureApiRef,
      getImageData,
      setWorkbench,
      activateDrawMode,
      setSignaturesApplied,
      getScrollState,
      handleDeactivateSignature,
      setHasUnsavedChanges,
      setApplyingSignatures,
      t,
      activeFileIndex,
      setActiveFileIndex,
    ]);

    const renderSettings = () => {
      const onSave = enableApplyAction ? handleSaveToSystem : undefined;
      if (settingsPanel === "wallet") {
        return (
          <SignatureWallet
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading || isApplying}
            applying={isApplying}
            onActivateSignaturePlacement={handleActivateSignaturePlacement}
            onDeactivateSignature={handleDeactivateSignature}
            onUndo={undo}
            onRedo={redo}
            onSave={onSave}
          />
        );
      }
      return (
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
          onSave={onSave}
          translationScope={translationScope}
          allowedSignatureSources={allowedSignatureSources}
          defaultSignatureSource={defaultSignatureSource}
        />
      );
    };

    const getSteps = () => {
      const steps = [];

      if (base.selectedFiles.length > 0) {
        steps.push({
          title: translateTool("steps.configure", "Configure Stamp"),
          isCollapsed: false,
          onCollapsedClick: undefined,
          content: renderSettings(),
        });

        // Optional step: send the document to others to sign instead.
        if (enableSharedSigning && groupSigningEnabled) {
          steps.push({
            title: translateTool("sharedSigningRequest", "Request signatures"),
            isCollapsed: false,
            onCollapsedClick: undefined,
            content: <SharedSigningLauncher />,
          });
        }
      }

      return steps;
    };

    return createToolFlow({
      files: {
        selectedFiles: base.selectedFiles,
        isCollapsed: base.operation.files.length > 0,
      },
      steps: getSteps(),
      preview: showSuggestions ? <SuggestedToolsSection /> : null,
      review: {
        isVisible: false,
        operation: base.operation,
        title: translateTool("results.title", "Stamp Results"),
        onFileClick: base.handleThumbnailClick,
        onUndo: () => {},
      },
      forceStepNumbers: true,
    });
  };

  const StampToolComponent = StampTool as ToolComponent;
  StampToolComponent.tool = () => useSignOperation;
  StampToolComponent.getDefaultParameters = () => ({
    ...DEFAULT_PARAMETERS,
    signatureType:
      config.defaultSignatureType ?? DEFAULT_PARAMETERS.signatureType,
  });

  return StampToolComponent;
};
