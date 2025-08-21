import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useToolFileSelection } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import RemovePasswordSettings from "../components/tools/removePassword/RemovePasswordSettings";

import { useRemovePasswordParameters } from "../hooks/tools/removePassword/useRemovePasswordParameters";
import { useRemovePasswordOperation } from "../hooks/tools/removePassword/useRemovePasswordOperation";
import { useRemovePasswordTips } from "../components/tooltips/useRemovePasswordTips";
import { BaseToolProps } from "../types/tool";

const RemovePassword = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions } = useNavigationActions();
  const { selectedFiles } = useToolFileSelection();

  const removePasswordParams = useRemovePasswordParameters();
  const removePasswordOperation = useRemovePasswordOperation();
  const removePasswordTips = useRemovePasswordTips();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(removePasswordParams.getEndpointName());


  useEffect(() => {
    removePasswordOperation.resetResults();
    onPreviewFile?.(null);
  }, [removePasswordParams.parameters]);

  const handleRemovePassword = async () => {
    try {
      await removePasswordOperation.executeOperation(removePasswordParams.parameters, selectedFiles);
      if (removePasswordOperation.files && onComplete) {
        onComplete(removePasswordOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("removePassword.error.failed", "Remove password operation failed"));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "removePassword");
  };

  const handleSettingsReset = () => {
    removePasswordOperation.resetResults();
    onPreviewFile?.(null);
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = removePasswordOperation.files.length > 0 || removePasswordOperation.downloadUrl !== null;
  const passwordCollapsed = !hasFiles || hasResults;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps: [
      {
        title: t("removePassword.password.stepTitle", "Remove Password"),
        isCollapsed: passwordCollapsed,
        onCollapsedClick: hasResults ? handleSettingsReset : undefined,
        tooltip: removePasswordTips,
        content: (
          <RemovePasswordSettings
            parameters={removePasswordParams.parameters}
            onParameterChange={removePasswordParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("removePassword.submit", "Remove Password"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleRemovePassword,
      disabled: !removePasswordParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: removePasswordOperation,
      title: t("removePassword.results.title", "Decrypted PDFs"),
      onFileClick: handleThumbnailClick,
    },
  });
};

export default RemovePassword;
