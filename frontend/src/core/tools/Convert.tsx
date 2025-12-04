import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { useFileState, useFileSelection } from "@app/contexts/FileContext";

import { createToolFlow } from "@app/components/tools/shared/createToolFlow";

import ConvertSettings from "@app/components/tools/convert/ConvertSettings";

import { useConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import { useConvertOperation } from "@app/hooks/tools/convert/useConvertOperation";
import { BaseToolProps, ToolComponent } from "@app/types/tool";

const Convert = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectors } = useFileState();
  const activeFiles = selectors.getFiles();
  const { selectedFiles } = useFileSelection();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const convertParams = useConvertParameters();
  const convertOperation = useConvertOperation();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(convertParams.getEndpointName());

  // Prevent reset immediately after operation completes (when consumeFiles auto-selects outputs)
  const skipNextSelectionResetRef = useRef(false);
  const previousSelectionRef = useRef<string>('');

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = convertOperation.files.length > 0 || convertOperation.downloadUrl !== null;
  const settingsCollapsed = hasResults;

  // When operation completes, flag the next selection change to skip reset
  useEffect(() => {
    if (hasResults) {
      skipNextSelectionResetRef.current = true;
    }
  }, [hasResults]);

  // Reset results when user manually changes file selection
  useEffect(() => {
    const currentSelection = selectedFiles.map(f => f.fileId).sort().join(',');

    if (currentSelection === previousSelectionRef.current) return; // No change

    // Skip reset if this is the auto-selection after operation completed
    // Don't analyze file types - would change parameters and trigger another reset
    if (skipNextSelectionResetRef.current) {
      skipNextSelectionResetRef.current = false;
      previousSelectionRef.current = currentSelection;
      return;
    }

    // User manually selected different files
    if (selectedFiles.length > 0) {
      previousSelectionRef.current = currentSelection;
      convertParams.analyzeFileTypes(selectedFiles);
      if (hasResults) {
        convertOperation.resetResults();
        onPreviewFile?.(null);
      }
    } else {
      previousSelectionRef.current = '';
      if (activeFiles.length === 0) {
        convertParams.resetParameters();
      }
    }
  }, [selectedFiles]);

  useEffect(() => {
    // Reset when user changes conversion parameters (but not during operation)
    if (!convertOperation.isLoading && !skipNextSelectionResetRef.current) {
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
    skipNextSelectionResetRef.current = false;
    convertOperation.resetResults();
    onPreviewFile?.(null);
  };

  const handleUndo = async () => {
    await convertOperation.undoOperation();
    onPreviewFile?.(null);
  };

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
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
      onUndo: handleUndo,
      testId: "conversion-results",
    },
  });
};

// Static method to get the operation hook for automation
Convert.tool = () => useConvertOperation;

export default Convert as ToolComponent;
