import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import CardSelector from "@app/components/shared/CardSelector";
import SplitSettings from "@app/components/tools/split/SplitSettings";
import { useSplitParameters } from "@app/hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "@app/hooks/tools/split/useSplitOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useSplitMethodTips } from "@app/components/tooltips/useSplitMethodTips";
import { useSplitSettingsTips } from "@app/components/tooltips/useSplitSettingsTips";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { type SplitMethod, METHOD_OPTIONS, type MethodOption, ENDPOINTS } from "@app/constants/splitConstants";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";

const Split = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'split',
    useSplitParameters,
    useSplitOperation,
    props
  );

  // Check which split endpoints are available
  const allSplitEndpoints = useMemo(() => Object.values(ENDPOINTS), []);
  const { endpointStatus } = useMultipleEndpointsEnabled(allSplitEndpoints);

  // Filter METHOD_OPTIONS to only show methods with enabled endpoints
  const availableMethodOptions = useMemo(() => {
    return METHOD_OPTIONS.filter(option => {
      const endpoint = ENDPOINTS[option.value];
      // If endpoint status is not loaded yet, show all options (optimistic)
      // If endpoint is explicitly disabled (false), hide the option
      return endpointStatus[endpoint] !== false;
    });
  }, [endpointStatus]);

  const methodTips = useSplitMethodTips();
  const settingsTips = useSplitSettingsTips(base.params.parameters.method);

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
        onCollapsedClick: () => base.params.updateParameter('method', null),
        tooltip: methodTips,
        content: (
          <CardSelector<SplitMethod, MethodOption>
            options={availableMethodOptions}
            onSelect={(method) => base.params.updateParameter('method', method)}
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
      title: t("split.resultsTitle", "Split Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default Split as ToolComponent;
