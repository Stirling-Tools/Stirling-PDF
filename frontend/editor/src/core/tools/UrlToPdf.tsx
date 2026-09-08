import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import UrlToPdfSettings from "@app/components/tools/urlToPdf/UrlToPdfSettings";
import { useUrlToPdfParameters } from "@app/hooks/tools/urlToPdf/useUrlToPdfParameters";
import { useUrlToPdfOperation } from "@app/hooks/tools/urlToPdf/useUrlToPdfOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const UrlToPdf = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { onComplete, onError } = props;

  const base = useBaseTool(
    "urlToPdf",
    useUrlToPdfParameters,
    useUrlToPdfOperation,
    props,
    { minFiles: 0, skipResetParamsOnFirstFiles: true },
  );

  const { operation, params } = base;

  const handleConvert = useCallback(async () => {
    try {
      await operation.executeOperation(params.parameters, []);
      if (operation.files && onComplete) {
        onComplete(operation.files);
      }
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : "URL to PDF operation failed",
      );
    }
  }, [operation, params.parameters, onComplete, onError]);

  return createToolFlow({
    files: {
      selectedFiles: [],
      isVisible: false,
    },
    steps: [
      {
        title: t("urlToPdf.steps.address", "Web address"),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed
          ? base.handleSettingsReset
          : undefined,
        content: (
          <UrlToPdfSettings
            parameters={params.parameters}
            onParameterChange={params.updateParameter}
            disabled={base.endpointLoading || operation.isLoading}
            onSubmit={handleConvert}
          />
        ),
      },
    ],
    executeButton: {
      text: t("urlToPdf.submit", "Convert to PDF"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: handleConvert,
      disableScopeHints: true,
      disabledReason:
        base.endpointEnabled === false
          ? "endpointUnavailable"
          : params.validateParameters()
            ? null
            : "invalidParams",
      testId: "url-to-pdf-submit",
    },
    review: {
      isVisible: base.hasResults,
      operation,
      title: t("urlToPdf.results", "URL to PDF Results"),
      onFileClick: base.handleThumbnailClick,
    },
  });
};

UrlToPdf.tool = () => useUrlToPdfOperation;

export default UrlToPdf as ToolComponent;
