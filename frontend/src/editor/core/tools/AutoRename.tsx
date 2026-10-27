import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps } from "@editor/types/tool";

import { useAutoRenameParameters } from "@editor/hooks/tools/autoRename/useAutoRenameParameters";
import { useAutoRenameOperation } from "@editor/hooks/tools/autoRename/useAutoRenameOperation";
import { useAutoRenameTips } from "@editor/components/tooltips/useAutoRenameTips";

const AutoRename = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const autoRenameTips = useAutoRenameTips();

  const base = useBaseTool(
    "auto-rename-pdf-file",
    useAutoRenameParameters,
    useAutoRenameOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("auto-rename.settings.title", "About"),
        isCollapsed: false,
        tooltip: autoRenameTips,
        content: null,
      },
    ],
    executeButton: {
      text: t("auto-rename.submit", "Auto Rename"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("auto-rename.results.title", "Auto-Rename Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default AutoRename;
