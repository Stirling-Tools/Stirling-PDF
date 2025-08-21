import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileState, useFileSelection } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import ConvertSettings from "../components/tools/convert/ConvertSettings";

import { useConvertParameters } from "../hooks/tools/convert/useConvertParameters";
import { useConvertOperation } from "../hooks/tools/convert/useConvertOperation";
import { BaseToolProps, ToolComponent } from "../types/tool";

const Convert = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectors } = useFileState();
  const { actions } = useNavigationActions();
  const activeFiles = selectors.getFiles();
  const { selectedFiles } = useFileSelection();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const convertParams = useConvertParameters();
  const convertOperation = useConvertOperation();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(convertParams.getEndpointName());

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = convertOperation.downloadUrl !== null;
  const settingsCollapsed = hasResults;

  useEffect(() => {
    if (selectedFiles.length > 0) {
      convertParams.analyzeFileTypes(selectedFiles);
    } else {
      // Only reset when there are no active files at all
      // If there are active files but no selected files, keep current format (user filtered by format)
      if (activeFiles.length === 0) {
        convertParams.resetParameters();
      }
    }
  }, [selectedFiles, activeFiles, convertParams.analyzeFileTypes, convertParams.resetParameters]);

  useEffect(() => {
    // Only clear results if we're not currently processing and parameters changed
    if (!convertOperation.isLoading) {
      convertOperation.resetResults();
      onPreviewFile?.(null);
    }
  }, [convertParams.parameters.fromExtension, convertParams.parameters.toExtension]);

  useEffect(() => {
    if (hasFiles) {
      setTimeout(scrollToBottom, 100);
    }
  }, [hasFiles]);

  useEffect(() => {
    if (hasResults) {
      setTimeout(scrollToBottom, 100);
    }
  }, [hasResults]);

  const handleConvert = async () => {
    try {
      await convertOperation.executeOperation(convertParams.parameters, selectedFiles);
      if (convertOperation.files && onComplete) {
        onComplete(convertOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : "Convert operation failed");
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "convert");
  };

  const handleSettingsReset = () => {
    convertOperation.resetResults();
    onPreviewFile?.(null);
  };

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
      placeholder: t("convert.selectFilesPlaceholder", "Select files in the main view to get started"),
    },
    steps: [
      {
        title: t("convert.settings", "Settings"),
        isCollapsed: settingsCollapsed,
        onCollapsedClick: settingsCollapsed ? handleSettingsReset : undefined,
        content: (
          <ConvertSettings
            parameters={convertParams.parameters}
            onParameterChange={convertParams.updateParameter}
            getAvailableToExtensions={convertParams.getAvailableToExtensions}
            selectedFiles={selectedFiles}
            disabled={endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("convert.convertFiles", "Convert Files"),
      loadingText: t("convert.converting", "Converting..."),
      onClick: handleConvert,
      isVisible: !hasResults,
      disabled: !convertParams.validateParameters() || !hasFiles || !endpointEnabled,
      testId: "convert-button",
    },
    review: {
      isVisible: hasResults,
      operation: convertOperation,
      title: t("convert.conversionResults", "Conversion Results"),
      onFileClick: handleThumbnailClick,
      testId: "conversion-results",
    },
  });
};

// Static method to get the operation hook for automation
Convert.tool = () => useConvertOperation;

export default Convert as ToolComponent;
