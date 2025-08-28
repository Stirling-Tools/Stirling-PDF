import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { useRemoveCertificateSignParameters } from "../hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters";
import { useRemoveCertificateSignOperation } from "../hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

const RemoveCertificateSign = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'removeCertificateSign',
    useRemoveCertificateSignParameters,
    useRemoveCertificateSignOperation,
    props
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      placeholder: t("removeCertSign.files.placeholder", "Select a PDF file in the main view to get started"),
    },
    steps: [],
    executeButton: {
      text: t("removeCertSign.submit", "Remove Signature"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removeCertSign.results.title", "Certificate Removal Results"),
      onFileClick: base.handleThumbnailClick,
    },
  });
};

// Static method to get the operation hook for automation
RemoveCertificateSign.tool = () => useRemoveCertificateSignOperation;

export default RemoveCertificateSign as ToolComponent;
