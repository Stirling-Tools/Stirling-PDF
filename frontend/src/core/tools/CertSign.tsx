import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import CertificateTypeSettings from "@app/components/tools/certSign/CertificateTypeSettings";
import CertificateFormatSettings from "@app/components/tools/certSign/CertificateFormatSettings";
import CertificateFilesSettings from "@app/components/tools/certSign/CertificateFilesSettings";
import SignatureAppearanceSettings from "@app/components/tools/certSign/SignatureAppearanceSettings";
import { useCertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import { useCertSignOperation } from "@app/hooks/tools/certSign/useCertSignOperation";
import { useCertificateTypeTips } from "@app/components/tooltips/useCertificateTypeTips";
import { useSignatureAppearanceTips } from "@app/components/tooltips/useSignatureAppearanceTips";
import { useSignModeTips } from "@app/components/tooltips/useSignModeTips";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const CertSign = (props: BaseToolProps) => {
  const { t } = useTranslation();
  
  const base = useBaseTool(
    'certSign',
    useCertSignParameters,
    useCertSignOperation,
    props
  );
  
  const certTypeTips = useCertificateTypeTips();
  const appearanceTips = useSignatureAppearanceTips();
  const signModeTips = useSignModeTips();

  // Check if certificate files are configured for appearance step
  const areCertFilesConfigured = () => {
    const params = base.params.parameters;
    
    // Auto mode (server certificate) - always configured
    if (params.signMode === 'AUTO') {
      return true;
    }
    
    // Manual mode - check for required files based on cert type
    switch (params.certType) {
      case 'PEM':
        return !!(params.privateKeyFile && params.certFile);
      case 'PKCS12':
      case 'PFX':
        return !!params.p12File;
      case 'JKS':
        return !!params.jksFile;
      default:
        return false;
    }
  };

  return createToolFlow({
    forceStepNumbers: true,
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("certSign.signMode.stepTitle", "Sign Mode"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: signModeTips,
        content: (
          <CertificateTypeSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      ...(base.params.parameters.signMode === 'MANUAL' ? [{
        title: t("certSign.certTypeStep.stepTitle", "Certificate Format"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: certTypeTips,
        content: (
          <CertificateFormatSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      }] : []),
      ...(base.params.parameters.signMode === 'MANUAL' ? [{
        title: t("certSign.certFiles.stepTitle", "Certificate Files"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: (
          <CertificateFilesSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      }] : []),
      {
        title: t("certSign.appearance.stepTitle", "Signature Appearance"),
        isCollapsed: base.settingsCollapsed || !areCertFilesConfigured(),
        onCollapsedClick: (base.settingsCollapsed || !areCertFilesConfigured()) ? base.handleSettingsReset : undefined,
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
      text: t("certSign.sign.submit", "Sign PDF"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("certSign.sign.results", "Signed PDF"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

// Static method to get the operation hook for automation
CertSign.tool = () => useCertSignOperation;

export default CertSign as ToolComponent;