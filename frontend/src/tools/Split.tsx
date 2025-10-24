import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import CardSelector from "../components/shared/CardSelector";
import SplitSettings from "../components/tools/split/SplitSettings";
import { useSplitParameters } from "../hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "../hooks/tools/split/useSplitOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { useSplitMethodTips } from "../components/tooltips/useSplitMethodTips";
import { useSplitSettingsTips } from "../components/tooltips/useSplitSettingsTips";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { type SplitMethod, METHOD_OPTIONS, type MethodOption } from "../constants/splitConstants";

const Split = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'split',
    useSplitParameters,
    useSplitOperation,
    props
  );

  const methodTips = useSplitMethodTips();
  const allSettingsTips = useSplitSettingsTips();

  // Get tooltip content for the currently selected method
  const settingsTips = base.params.parameters.method
    ? allSettingsTips[base.params.parameters.method]
    : null;

  // Get tooltip content for a specific method
  const getMethodTooltip = (option: MethodOption) => {
    const tooltipContent = allSettingsTips[option.value];
    return tooltipContent?.tips || [];
  };

  // Get the method name for the settings step title
  const getSettingsTitle = () => {
    if (!base.params.parameters.method) return t("split.steps.settings", "Settings");

    const methodOption = METHOD_OPTIONS.find(option => option.value === base.params.parameters.method);
    if (!methodOption) return t("split.steps.settings", "Settings");

    const prefix = t(methodOption.prefixKey, "Split by");
    const name = t(methodOption.nameKey, "Method Name");
    return `${prefix} ${name}`;
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
        onCollapsedClick: () => base.params.updateParameter('method', '')
        ,
        tooltip: methodTips,
        content: (
          <CardSelector<SplitMethod, MethodOption>
            options={METHOD_OPTIONS}
            onSelect={(method) => base.params.updateParameter('method', method)}
            disabled={base.endpointLoading}
            getTooltipContent={getMethodTooltip}
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
