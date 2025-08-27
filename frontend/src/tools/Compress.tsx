import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import CompressSettings from "../components/tools/compress/CompressSettings";
import { useCompressParameters } from "../hooks/tools/compress/useCompressParameters";
import { useCompressOperation } from "../hooks/tools/compress/useCompressOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useCompressTips } from "../components/tooltips/useCompressTips";

const Compress = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("compress-pdf");
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
            disabled={endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("compress.submit", "Compress"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("compress.title", "Compression Results"),
      onFileClick: base.handleThumbnailClick,
    },
  });
};


export default Compress as ToolComponent;
