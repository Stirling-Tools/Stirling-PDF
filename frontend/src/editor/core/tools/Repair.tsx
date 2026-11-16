import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { useRepairParameters } from "@editor/hooks/tools/repair/useRepairParameters";
import { useRepairOperation } from "@editor/hooks/tools/repair/useRepairOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

const Repair = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "repair",
    useRepairParameters,
    useRepairOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [],
    executeButton: {
      text: t("repair.submit", "Repair PDF"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("repair.results.title", "Repair Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
Repair.tool = () => useRepairOperation;

export default Repair as ToolComponent;
