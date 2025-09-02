import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { useSingleLargePageParameters } from "../hooks/tools/singleLargePage/useSingleLargePageParameters";
import { useSingleLargePageOperation } from "../hooks/tools/singleLargePage/useSingleLargePageOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

const SingleLargePage = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'singleLargePage',
    useSingleLargePageParameters,
    useSingleLargePageOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      placeholder: t("pdfToSinglePage.files.placeholder", "Select a PDF file in the main view to get started"),
    },
    steps: [],
    executeButton: {
      text: t("pdfToSinglePage.submit", "Convert To Single Page"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("pdfToSinglePage.results.title", "Single Page Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
SingleLargePage.tool = () => useSingleLargePageOperation;

export default SingleLargePage as ToolComponent;
