import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useUnlockPdfFormsParameters } from "@app/hooks/tools/unlockPdfForms/useUnlockPdfFormsParameters";
import { useUnlockPdfFormsOperation } from "@app/hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const UnlockPdfForms = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'unlockPdfForms',
    useUnlockPdfFormsParameters,
    useUnlockPdfFormsOperation,
    props
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
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
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
