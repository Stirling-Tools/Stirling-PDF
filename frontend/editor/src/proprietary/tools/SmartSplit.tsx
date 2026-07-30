import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import type { BaseToolProps } from "@app/types/tool";
import SmartSplitSettings from "@app/components/tools/docparse/SmartSplitSettings";
import { useSmartSplitParameters } from "@app/hooks/tools/smartSplit/useSmartSplitParameters";
import { useSmartSplitOperation } from "@app/hooks/tools/smartSplit/useSmartSplitOperation";

const SmartSplit = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "smartSplit",
    useSmartSplitParameters,
    useSmartSplitOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("smartSplit.settings.title", "Split settings"),
        isCollapsed: false,
        content: (
          <SmartSplitSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("smartSplit.submit", "Split document"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("smartSplit.results.title", "Split documents"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default SmartSplit;
