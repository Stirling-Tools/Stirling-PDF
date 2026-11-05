import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { useUnlockPdfFormsParameters } from "@editor/hooks/tools/unlockPdfForms/useUnlockPdfFormsParameters";
import { useUnlockPdfFormsOperation } from "@editor/hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

const UnlockPdfForms = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "unlockPdfForms",
    useUnlockPdfFormsParameters,
    useUnlockPdfFormsOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasFiles || base.hasResults,
    },
    steps: [],
    executeButton: {
      text: t("unlockPDFForms.submit", "Unlock Forms"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("unlockPDFForms.results.title", "Unlocked Forms Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
UnlockPdfForms.tool = () => useUnlockPdfFormsOperation;

export default UnlockPdfForms as ToolComponent;
