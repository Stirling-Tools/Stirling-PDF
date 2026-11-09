import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import RemoveCertificateSignSettings from "@editor/components/tools/removeCertificateSign/RemoveCertificateSignSettings";
import { useRemoveCertificateSignParameters } from "@editor/hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters";
import { useRemoveCertificateSignOperation } from "@editor/hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { useKeptSignatureStamp } from "@editor/hooks/tools/removeCertificateSign/useKeptSignatureStamp";
import { Banner } from "@editor/ui/Banner";
import { Icon } from "@editor/ui/Icon";

const RemoveCertificateSign = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "removeCertificateSign",
    useRemoveCertificateSignParameters,
    useRemoveCertificateSignOperation,
    props,
  );

  const { stampKept, recordRun } = useKeptSignatureStamp();

  const handleExecute = () => {
    recordRun(
      base.selectedFiles,
      base.params.parameters.removeVisibleSignature,
    );
    return base.handleExecute();
  };

  const stampKeptNotice = stampKept && (
    <Banner
      tone="info"
      icon={<Icon name="info" />}
      description={t(
        "removeCertSign.results.visibleSignatureKept",
        "The visible signature stamp was kept. Turn on 'Remove visible signature' to remove it too.",
      )}
    />
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("removeCertSign.settings", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.hasResults
          ? base.handleSettingsReset
          : undefined,
        content: (
          <RemoveCertificateSignSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("removeCertSign.submit", "Remove Signature"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("removeCertSign.results.title", "Certificate Removal Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
      notice: stampKeptNotice,
    },
  });
};

// Static method to get the operation hook for automation
RemoveCertificateSign.tool = () => useRemoveCertificateSignOperation;

export default RemoveCertificateSign as ToolComponent;
