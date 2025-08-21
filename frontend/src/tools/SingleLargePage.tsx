import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";
import { useFileSelection } from "../contexts/file/fileHooks";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import { useSingleLargePageParameters } from "../hooks/tools/singleLargePage/useSingleLargePageParameters";
import { useSingleLargePageOperation } from "../hooks/tools/singleLargePage/useSingleLargePageOperation";
import { BaseToolProps } from "../types/tool";

const SingleLargePage = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions } = useNavigationActions();
  const { selectedFiles } = useFileSelection();

  const singleLargePageParams = useSingleLargePageParameters();
  const singleLargePageOperation = useSingleLargePageOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(singleLargePageParams.getEndpointName());

  useEffect(() => {
    singleLargePageOperation.resetResults();
    onPreviewFile?.(null);
  }, [singleLargePageParams.parameters]);

  const handleConvert = async () => {
    try {
      await singleLargePageOperation.executeOperation(singleLargePageParams.parameters, selectedFiles);
      if (singleLargePageOperation.files && onComplete) {
        onComplete(singleLargePageOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("pdfToSinglePage.error.failed", "Single large page operation failed"));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "single-large-page");
    actions.setMode("viewer");
  };

  const handleSettingsReset = () => {
    singleLargePageOperation.resetResults();
    onPreviewFile?.(null);
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = singleLargePageOperation.files.length > 0 || singleLargePageOperation.downloadUrl !== null;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasFiles || hasResults,
      placeholder: t("pdfToSinglePage.files.placeholder", "Select a PDF file in the main view to get started"),
    },
    steps: [],
    executeButton: {
      text: t("pdfToSinglePage.submit", "Convert To Single Page"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleConvert,
      disabled: !singleLargePageParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: singleLargePageOperation,
      title: t("pdfToSinglePage.results.title", "Single Page Results"),
      onFileClick: handleThumbnailClick,
    },
  });
};

export default SingleLargePage;