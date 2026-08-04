import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import ReplaceImageSettings from "@app/components/tools/replaceImage/ReplaceImageSettings";
import { useReplaceImageParameters } from "@app/hooks/tools/replaceImage/useReplaceImageParameters";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { buildReplaceImageFormData } from "@app/hooks/tools/replaceImage/useReplaceImageOperation";

const ReplaceImage = (props: BaseToolProps) => {
  const { t } = useTranslation();
  
  const base = useBaseTool(
    "replaceImage",
    useReplaceImageParameters,
    // Custom operation hook that handles the replacement image
    () => {
      const operation = require("@app/hooks/tools/replaceImage/useReplaceImageOperation").useReplaceImageOperation();
      return operation;
    },
    props,
  );

  const [replacementFile, setReplacementFile] = useState<File | null>(null);

  const handleExecuteWithReplacement = useCallback(() => {
    if (!replacementFile || base.selectedFiles.length === 0) {
      return;
    }

    const formData = buildReplaceImageFormData(
      base.params.parameters,
      base.selectedFiles[0],
      replacementFile,
    );

    base.handleCustomExecute(formData);
  }, [replacementFile, base]);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("replaceImage.settings.title", "Replace Image Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        content: (
          <ReplaceImageSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
            onReplaceImageSelect={setReplacementFile}
            selectedReplacementFile={replacementFile}
          />
        ),
      },
    ],
    executeButton: {
      text: t("replaceImage.submit", "Replace Image"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: handleExecuteWithReplacement,
      endpointEnabled: base.endpointEnabled && !!replacementFile,
      paramsValid: base.params.validateParameters() && !!replacementFile,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("replaceImage.results.title", "Replace Image Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ReplaceImage as ToolComponent;
