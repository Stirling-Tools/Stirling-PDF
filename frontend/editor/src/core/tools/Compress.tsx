import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import CompressSettings from "@app/components/tools/compress/CompressSettings";
import { useCompressParameters } from "@app/hooks/tools/compress/useCompressParameters";
import { useCompressOperation } from "@app/hooks/tools/compress/useCompressOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useCompressTips } from "@app/components/tooltips/useCompressTips";
import { useUnreducedOutputs } from "@app/hooks/tools/compress/useUnreducedOutputs";
import { Banner } from "@app/ui/Banner";
import { Icon } from "@app/ui/Icon";

const Compress = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const compressTips = useCompressTips();

  const base = useBaseTool(
    "compress",
    useCompressParameters,
    useCompressOperation,
    props,
  );

  const { unreduced, total, recordInputs } = useUnreducedOutputs(
    base.operation.outputFileIds,
  );

  const handleExecute = () => {
    recordInputs(base.selectedFiles);
    return base.handleExecute();
  };

  const noReductionNotice = unreduced > 0 && (
    <Banner
      tone="warning"
      icon={<Icon name="triangle-alert" />}
      description={
        total === 1
          ? t(
              "compress.noReduction.single",
              "Compression ran successfully, but this file can't be compressed any further.",
            )
          : t("compress.noReduction.multiple", {
              count: unreduced,
              total,
              defaultValue:
                "Compression ran successfully, but {{count}} of {{total}} files can't be compressed any further.",
            })
      }
    />
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("compress.settings.title", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: compressTips,
        content: (
          <CompressSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("compress.submit", "Compress"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("compress.title", "Compression Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
      notice: noReductionNotice,
    },
  });
};

export default Compress as ToolComponent;
