import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import type { BaseToolProps } from "@app/types/tool";
import FillTemplateSettings from "@app/components/tools/docparse/FillTemplateSettings";
import { useFillTemplateParameters } from "@app/hooks/tools/fillTemplate/useFillTemplateParameters";
import { useFillTemplateOperation } from "@app/hooks/tools/fillTemplate/useFillTemplateOperation";

const FillTemplate = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "fillTemplate",
    useFillTemplateParameters,
    useFillTemplateOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("fillTemplate.settings.title", "Template data"),
        isCollapsed: false,
        content: (
          <FillTemplateSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("fillTemplate.submit", "Fill template"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("fillTemplate.results.title", "Filled document"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default FillTemplate;
