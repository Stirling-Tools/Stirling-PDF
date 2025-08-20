import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useToolFileSelection } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
import SanitizeSettings from "../components/tools/sanitize/SanitizeSettings";

import { useSanitizeParameters } from "../hooks/tools/sanitize/useSanitizeParameters";
import { useSanitizeOperation } from "../hooks/tools/sanitize/useSanitizeOperation";
import { BaseToolProps } from "../types/tool";

const Sanitize = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();

  const { selectedFiles } = useToolFileSelection();
  const { actions } = useNavigationActions();

  const sanitizeParams = useSanitizeParameters();
  const sanitizeOperation = useSanitizeOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(sanitizeParams.getEndpointName());

  useEffect(() => {
    sanitizeOperation.resetResults();
    onPreviewFile?.(null);
  }, [sanitizeParams.parameters]);

  const handleSanitize = async () => {
    try {
      await sanitizeOperation.executeOperation(sanitizeParams.parameters, selectedFiles);
      if (sanitizeOperation.files && onComplete) {
        onComplete(sanitizeOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("sanitize.error.generic", "Sanitization failed"));
      }
    }
  };

  const handleSettingsReset = () => {
    sanitizeOperation.resetResults();
    onPreviewFile?.(null);
    actions.setMode("sanitize");
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "sanitize");
    actions.setMode("viewer");
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = sanitizeOperation.files.length > 0;
  const filesCollapsed = hasFiles || hasResults;
  const settingsCollapsed = !hasFiles || hasResults;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: filesCollapsed,
      placeholder: t("sanitize.files.placeholder", "Select a PDF file in the main view to get started"),
    },
    steps: [
      {
        title: t("sanitize.steps.settings", "Settings"),
        isCollapsed: settingsCollapsed,
        onCollapsedClick: settingsCollapsed ? handleSettingsReset : undefined,
        content: (
          <SanitizeSettings
            parameters={sanitizeParams.parameters}
            onParameterChange={sanitizeParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("sanitize.submit", "Sanitize PDF"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleSanitize,
      disabled: !sanitizeParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: sanitizeOperation,
      title: t("sanitize.sanitizationResults", "Sanitization Results"),
      onFileClick: handleThumbnailClick,
    },
  });
};

export default Sanitize;
