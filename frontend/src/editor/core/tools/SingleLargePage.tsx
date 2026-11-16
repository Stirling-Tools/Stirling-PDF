import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { useSingleLargePageParameters } from "@editor/hooks/tools/singleLargePage/useSingleLargePageParameters";
import { useSingleLargePageOperation } from "@editor/hooks/tools/singleLargePage/useSingleLargePageOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

const SingleLargePage = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "singleLargePage",
    useSingleLargePageParameters,
    useSingleLargePageOperation,
    props,
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
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
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
