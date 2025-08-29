import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { useUnlockPdfFormsParameters } from "../hooks/tools/unlockPdfForms/useUnlockPdfFormsParameters";
import { useUnlockPdfFormsOperation } from "../hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

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
      placeholder: t("unlockPDFForms.files.placeholder", "Select a PDF file in the main view to get started"),
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
    },
  });
};

// Static method to get the operation hook for automation
UnlockPdfForms.tool = () => useUnlockPdfFormsOperation;

export default UnlockPdfForms as ToolComponent;
