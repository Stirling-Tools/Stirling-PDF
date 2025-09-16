import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import SplitMethodSelector from "../components/tools/split/SplitMethodSelector";
import SplitSettings from "../components/tools/split/SplitSettings";
import { useSplitParameters } from "../hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "../hooks/tools/split/useSplitOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { useSplitMethodTips } from "../components/tooltips/useSplitMethodTips";
import { useSplitSettingsTips } from "../components/tooltips/useSplitSettingsTips";
import { BaseToolProps, ToolComponent } from "../types/tool";

const Split = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'split',
    useSplitParameters,
    useSplitOperation,
    props
  );

  const methodTips = useSplitMethodTips();
  const settingsTips = useSplitSettingsTips(base.params.parameters.method);

  // Get the method name for the settings step title
  const getSettingsTitle = () => {
    if (!base.params.parameters.method) return t("split.steps.settings", "Settings");

    const methodTitleMap = {
      'byPages': {
        prefix: t("split.methods.prefix.splitAt", "Split at"),
        name: t("split.methods.byPages.name", "Page Numbers")
      },
      'bySections': {
        prefix: t("split.methods.prefix.splitBy", "Split by"),
        name: t("split.methods.bySections.name", "Sections")
      },
      'bySize': {
        prefix: t("split.methods.prefix.splitBy", "Split by"),
        name: t("split.methods.bySize.name", "File Size")
      },
      'byPageCount': {
        prefix: t("split.methods.prefix.splitBy", "Split by"),
        name: t("split.methods.byPageCount.name", "Page Count")
      },
      'byDocCount': {
        prefix: t("split.methods.prefix.splitBy", "Split by"),
        name: t("split.methods.byDocCount.name", "Document Count")
      },
      'byChapters': {
        prefix: t("split.methods.prefix.splitBy", "Split by"),
        name: t("split.methods.byChapters.name", "Chapters")
      },
      'byPageDivider': {
        prefix: t("split.methods.prefix.splitBy", "Split by"),
        name: t("split.methods.byPageDivider.name", "Page Divider")
      },
    };

    const method = methodTitleMap[base.params.parameters.method as keyof typeof methodTitleMap];
    return method ? `${method.prefix} ${method.name}` : t("split.steps.settings", "Settings");
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("split.steps.chooseMethod", "Choose Method"),
        isCollapsed: !!base.params.parameters.method, // Collapse when method is selected
        onCollapsedClick: () => {
          // Clear the selected method to expand the method selection step
          base.params.updateParameter('method', '');
        },
        tooltip: methodTips,
        content: (
          <SplitMethodSelector
            selectedMethod={base.params.parameters.method}
            onMethodSelect={(method) => base.params.updateParameter('method', method)}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: getSettingsTitle(),
        isCollapsed: !base.params.parameters.method, // Collapsed until method selected
        onCollapsedClick: base.hasResults ? base.handleSettingsReset : undefined,
        tooltip: settingsTips || undefined,
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
