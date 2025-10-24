import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useSingleLargePageParameters } from "@app/hooks/tools/singleLargePage/useSingleLargePageParameters";
import { useSingleLargePageOperation } from "@app/hooks/tools/singleLargePage/useSingleLargePageOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

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
