import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";
import { useToolFileSelection } from "../contexts/file/fileHooks";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import { useRemoveCertificateSignParameters } from "../hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters";
import { useRemoveCertificateSignOperation } from "../hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { BaseToolProps } from "../types/tool";

const RemoveCertificateSign = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions } = useNavigationActions();
  const { selectedFiles } = useToolFileSelection();

  const removeCertificateSignParams = useRemoveCertificateSignParameters();
  const removeCertificateSignOperation = useRemoveCertificateSignOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(removeCertificateSignParams.getEndpointName());

  useEffect(() => {
    removeCertificateSignOperation.resetResults();
    onPreviewFile?.(null);
  }, [removeCertificateSignParams.parameters]);

  const handleRemoveSignature = async () => {
    try {
      await removeCertificateSignOperation.executeOperation(removeCertificateSignParams.parameters, selectedFiles);
      if (removeCertificateSignOperation.files && onComplete) {
        onComplete(removeCertificateSignOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("removeCertSign.error.failed", "Remove certificate signature operation failed"));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "removeCertificateSign");
    actions.setMode("viewer");
  };

  const handleSettingsReset = () => {
    removeCertificateSignOperation.resetResults();
    onPreviewFile?.(null);
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = removeCertificateSignOperation.files.length > 0 || removeCertificateSignOperation.downloadUrl !== null;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasFiles || hasResults,
      placeholder: t("removeCertSign.files.placeholder", "Select a PDF file in the main view to get started"),
    },
    steps: [],
    executeButton: {
      text: t("removeCertSign.submit", "Remove Signature"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleRemoveSignature,
      disabled: !removeCertificateSignParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: removeCertificateSignOperation,
      title: t("removeCertSign.results.title", "Certificate Removal Results"),
      onFileClick: handleThumbnailClick,
    },
  });
};

export default RemoveCertificateSign;