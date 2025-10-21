import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import CompressSettings from "@app/components/tools/compress/CompressSettings";
import { useCompressParameters } from "@app/hooks/tools/compress/useCompressParameters";
import { useCompressOperation } from "@app/hooks/tools/compress/useCompressOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useCompressTips } from "@app/components/tooltips/useCompressTips";

const Compress = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const compressTips = useCompressTips();

  const base = useBaseTool(
    'compress',
    useCompressParameters,
    useCompressOperation,
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
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
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
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("compress.title", "Compression Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};


export default Compress as ToolComponent;
