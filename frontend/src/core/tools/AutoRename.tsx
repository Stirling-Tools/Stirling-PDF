import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps } from "@app/types/tool";

import { useAutoRenameParameters } from "@app/hooks/tools/autoRename/useAutoRenameParameters";
import { useAutoRenameOperation } from "@app/hooks/tools/autoRename/useAutoRenameOperation";
import { useAutoRenameTips } from "@app/components/tooltips/useAutoRenameTips";

const AutoRename =(props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    '"auto-rename-pdf-file',
    useAutoRenameParameters,
    useAutoRenameOperation,
    props
  );

return createToolFlow({
    title: { title:t("auto-rename.title", "Auto Rename PDF"), description: t("auto-rename.description", "Auto Rename PDF"), tooltip: useAutoRenameTips()},
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [],
    executeButton: {
      text: t("auto-rename.submit", "Auto Rename"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
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
