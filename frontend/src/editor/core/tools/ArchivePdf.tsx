import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import ArchivePdfSettings from "@editor/components/tools/archivePdf/ArchivePdfSettings";
import { useArchivePdfTips } from "@editor/components/tooltips/useArchivePdfTips";
import { useArchivePdfParameters } from "@editor/hooks/tools/archivePdf/useArchivePdfParameters";
import { useArchivePdfOperation } from "@editor/hooks/tools/archivePdf/useArchivePdfOperation";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { usePdfSignatureDetection } from "@editor/hooks/usePdfSignatureDetection";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { Banner } from "@editor/ui/Banner";
import { Icon } from "@editor/ui/Icon";

const ArchivePdf = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const tips = useArchivePdfTips();

  const base = useBaseTool(
    "archivePdf",
    useArchivePdfParameters,
    useArchivePdfOperation,
    props,
  );
  const { hasDigitalSignatures } = usePdfSignatureDetection(base.selectedFiles);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("archivePdf.options.stepTitle", "Settings"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        tooltip: tips,
        content: (
          <Stack gap="md">
            {hasDigitalSignatures && (
              <Banner
                tone="warning"
                icon={<Icon name="triangle-alert" />}
                description={t(
                  "archivePdf.signatureWarning",
                  "This PDF is digitally signed. Converting it to PDF/A removes the signature.",
                )}
              />
            )}
            <ArchivePdfSettings
              parameters={base.params.parameters}
              onParameterChange={base.params.updateParameter}
              disabled={base.endpointLoading}
            />
          </Stack>
        ),
      },
    ],
    executeButton: {
      text: t("archivePdf.submit", "Convert to PDF/A"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("archivePdf.results.title", "PDF/A Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

ArchivePdf.tool = () => useArchivePdfOperation;

export default ArchivePdf as ToolComponent;
