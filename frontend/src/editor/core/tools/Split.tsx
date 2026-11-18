import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { Stack } from "@mantine/core";
import SplitMethodSelect from "@editor/components/tools/split/SplitMethodSelect";
import SplitSettings from "@editor/components/tools/split/SplitSettings";
import { useSplitParameters } from "@editor/hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "@editor/hooks/tools/split/useSplitOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { useSplitMethodTips } from "@editor/components/tooltips/useSplitMethodTips";
import { useSplitSettingsTips } from "@editor/components/tooltips/useSplitSettingsTips";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { METHOD_OPTIONS, ENDPOINTS } from "@editor/constants/splitConstants";
import { useMultipleEndpointsEnabled } from "@editor/hooks/useEndpointConfig";

const Split = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "split",
    useSplitParameters,
    useSplitOperation,
    props,
  );

  // Check which split endpoints are available
  const allSplitEndpoints = useMemo(() => Object.values(ENDPOINTS), []);
  const { endpointStatus } = useMultipleEndpointsEnabled(allSplitEndpoints);

  // Filter METHOD_OPTIONS to only show methods with enabled endpoints
  const availableMethodOptions = useMemo(() => {
    return METHOD_OPTIONS.filter((option) => {
      const endpoint = ENDPOINTS[option.value];
      // If endpoint status is not loaded yet, show all options (optimistic)
      // If endpoint is explicitly disabled (false), hide the option
      return endpointStatus[endpoint] !== false;
    });
  }, [endpointStatus]);

  const methodTips = useSplitMethodTips();
  const settingsTips = useSplitSettingsTips(base.params.parameters.method);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("split.steps.settings", "Settings"),
        isCollapsed: base.hasResults,
        onCollapsedClick: base.hasResults
          ? base.handleSettingsReset
          : undefined,
        tooltip: settingsTips ?? methodTips,
        content: (
          <Stack gap="md">
            <SplitMethodSelect
              options={availableMethodOptions}
              value={base.params.parameters.method}
              onChange={(method) =>
                base.params.updateParameter("method", method)
              }
              disabled={base.endpointLoading}
            />
            <SplitSettings
              parameters={base.params.parameters}
              onParameterChange={base.params.updateParameter}
              disabled={base.endpointLoading}
            />
          </Stack>
        ),
      },
    ],
    executeButton: {
      text: t("split.submit", "Split PDF"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
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
