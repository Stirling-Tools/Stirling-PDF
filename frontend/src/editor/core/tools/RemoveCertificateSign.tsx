import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { useRemoveCertificateSignParameters } from "@editor/hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters";
import { useRemoveCertificateSignOperation } from "@editor/hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";

const RemoveCertificateSign = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "removeCertificateSign",
    useRemoveCertificateSignParameters,
    useRemoveCertificateSignOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [],
    executeButton: {
      text: t("removeCertSign.submit", "Remove Signature"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removeCertSign.results.title", "Certificate Removal Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
RemoveCertificateSign.tool = () => useRemoveCertificateSignOperation;

export default RemoveCertificateSign as ToolComponent;
