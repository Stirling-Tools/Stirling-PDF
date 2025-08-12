import React, { useEffect, useRef } from "react";
import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolSteps, ToolStepProvider } from "../components/tools/shared/ToolStep";
import OperationButton from "../components/tools/shared/OperationButton";

import ConvertSettings from "../components/tools/convert/ConvertSettings";

import { useConvertParameters } from "../hooks/tools/convert/useConvertParameters";
import { useConvertOperation } from "../hooks/tools/convert/useConvertOperation";
import { BaseToolProps } from "../types/tool";

const Convert = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode, activeFiles } = useFileContext();
  const { selectedFiles } = useToolFileSelection();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const convertParams = useConvertParameters();
  const convertOperation = useConvertOperation();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(
    convertParams.getEndpointName()
  );

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = convertOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
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
  }, [selectedFiles, activeFiles]);

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
      await convertOperation.executeOperation(
        convertParams.parameters,
        selectedFiles
      );
      if (convertOperation.files && onComplete) {
        onComplete(convertOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Convert operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'convert');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    convertOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('convert');
  };

  const steps = createToolSteps();

  return (
    <div className="h-full max-h-screen overflow-y-auto" ref={scrollContainerRef}>
      <Stack gap="sm" p="sm">
        <ToolStepProvider>
          {/* Files Step */}
          {steps.createFilesStep({
            selectedFiles,
            isCollapsed: filesCollapsed,
            placeholder: t("convert.selectFilesPlaceholder", "Select files in the main view to get started")
          })}

          {/* Settings Step */}
          {steps.create(t("convert.settings", "Settings"), {
            isCollapsed: settingsCollapsed,
            isCompleted: settingsCollapsed,
            onCollapsedClick: settingsCollapsed ? handleSettingsReset : undefined,
          }, (
            <Stack gap="sm">
              <ConvertSettings
                parameters={convertParams.parameters}
                onParameterChange={convertParams.updateParameter}
                getAvailableToExtensions={convertParams.getAvailableToExtensions}
                selectedFiles={selectedFiles}
                disabled={endpointLoading}
              />
            </Stack>
          ))}
           {!hasResults && (
                <OperationButton
                  onClick={handleConvert}
                  isLoading={convertOperation.isLoading}
                  disabled={!convertParams.validateParameters() || !hasFiles || !endpointEnabled}
                  loadingText={t("convert.converting", "Converting...")}
                  submitText={t("convert.convertFiles", "Convert Files")}
                  data-testid="convert-button"
                />
              )}

          {/* Results Step */}
          {steps.createResultsStep({
            isVisible: hasResults,
            operation: convertOperation,
            title: t("convert.conversionResults", "Conversion Results"),
            onFileClick: handleThumbnailClick
          })}
        </ToolStepProvider>
      </Stack>
    </div>
  );
};

export default Convert;
