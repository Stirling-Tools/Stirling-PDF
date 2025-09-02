import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import CertificateTypeSettings from "../components/tools/manageSignatures/CertificateTypeSettings";
import CertificateFilesSettings from "../components/tools/manageSignatures/CertificateFilesSettings";
import SignatureAppearanceSettings from "../components/tools/manageSignatures/SignatureAppearanceSettings";
import { useManageSignaturesParameters } from "../hooks/tools/manageSignatures/useManageSignaturesParameters";
import { useManageSignaturesOperation } from "../hooks/tools/manageSignatures/useManageSignaturesOperation";
import { useCertificateTypeTips } from "../components/tooltips/useCertificateTypeTips";
import { useSignatureAppearanceTips } from "../components/tooltips/useSignatureAppearanceTips";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";

const ManageSignatures = (props: BaseToolProps) => {
  const { t } = useTranslation();
  
  const base = useBaseTool(
    'manageSignatures',
    useManageSignaturesParameters,
    useManageSignaturesOperation,
    props
  );
  
  const certTypeTips = useCertificateTypeTips();
  const appearanceTips = useSignatureAppearanceTips();

  return createToolFlow({
    forceStepNumbers: true,
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      placeholder: t("manageSignatures.files.placeholder", "Select PDF files to sign with certificates"),
    },
    steps: [
      {
        title: t("manageSignatures.certType.stepTitle", "Certificate Type"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: certTypeTips,
        content: (
          <CertificateTypeSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("manageSignatures.certFiles.stepTitle", "Certificate Files"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: (
          <CertificateFilesSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("manageSignatures.appearance.stepTitle", "Signature Appearance"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: appearanceTips,
        content: (
          <SignatureAppearanceSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("manageSignatures.sign.submit", "Sign PDF"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("manageSignatures.sign.results", "Signed PDF"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
ManageSignatures.tool = () => useManageSignaturesOperation;

export default ManageSignatures as ToolComponent;