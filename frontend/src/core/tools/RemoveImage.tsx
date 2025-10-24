import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useRemoveImageParameters } from "@app/hooks/tools/removeImage/useRemoveImageParameters";
import { useRemoveImageOperation } from "@app/hooks/tools/removeImage/useRemoveImageOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

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


