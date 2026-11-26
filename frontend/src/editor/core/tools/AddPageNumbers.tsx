import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { useAddPageNumbersParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";
import { useAddPageNumbersOperation } from "@editor/components/tools/addPageNumbers/useAddPageNumbersOperation";
import AddPageNumbersSettings from "@editor/components/tools/addPageNumbers/AddPageNumbersSettings";

const AddPageNumbers = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "addPageNumbers",
    useAddPageNumbersParameters,
    useAddPageNumbersOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("addPageNumbers.settings", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        content: (
          <AddPageNumbersSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
            file={base.selectedFiles[0] ?? null}
          />
        ),
      },
    ],
    executeButton: {
      text: t("addPageNumbers.submit", "Add Page Numbers"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("addPageNumbers.results.title", "Page Number Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

AddPageNumbers.tool = () => useAddPageNumbersOperation;

export default AddPageNumbers as ToolComponent;
