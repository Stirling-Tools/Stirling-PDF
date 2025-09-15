import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import SplitSettings from "../components/tools/split/SplitSettings";
import { useSplitParameters } from "../hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "../hooks/tools/split/useSplitOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { useSplitTips } from "../components/tooltips/useSplitTips";
import { BaseToolProps, ToolComponent } from "../types/tool";

const Split = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const splitTips = useSplitTips();

  const base = useBaseTool(
    'split',
    useSplitParameters,
    useSplitOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: "Settings",
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.hasResults ? base.handleSettingsReset : undefined,
        tooltip: splitTips,
        content: (
          <SplitSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("split.submit", "Split PDF"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: "Split Results",
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default Split as ToolComponent;
