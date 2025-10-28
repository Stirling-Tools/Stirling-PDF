import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useRepairParameters } from "@app/hooks/tools/repair/useRepairParameters";
import { useRepairOperation } from "@app/hooks/tools/repair/useRepairOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const Repair = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'repair',
    useRepairParameters,
    useRepairOperation,
    props
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
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
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
