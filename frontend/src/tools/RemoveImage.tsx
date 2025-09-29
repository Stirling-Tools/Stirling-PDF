import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { useRemoveImageParameters } from "../hooks/tools/removeImage/useRemoveImageParameters";
import { useRemoveImageOperation } from "../hooks/tools/removeImage/useRemoveImageOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

const RemoveImage = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'removeImage',
    useRemoveImageParameters,
    useRemoveImageOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [],
    executeButton: {
      text: t("removeImage.submit", "Remove Images"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removeImage.results.title", "Remove Images Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

RemoveImage.tool = () => useRemoveImageOperation;

export default RemoveImage as ToolComponent;


