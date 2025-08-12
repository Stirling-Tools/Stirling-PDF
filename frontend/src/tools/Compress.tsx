import React, { useEffect, useMemo } from "react";
import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolSteps, ToolStepProvider } from "../components/tools/shared/ToolStep";
import OperationButton from "../components/tools/shared/OperationButton";

import CompressSettings from "../components/tools/compress/CompressSettings";

import { useCompressParameters } from "../hooks/tools/compress/useCompressParameters";
import { useCompressOperation } from "../hooks/tools/compress/useCompressOperation";
import { BaseToolProps } from "../types/tool";
import { CompressTips } from "../components/tooltips/CompressTips";

const Compress = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const compressParams = useCompressParameters();
  const compressOperation = useCompressOperation();
  const compressTips = CompressTips();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("compress-pdf");

  useEffect(() => {
    compressOperation.resetResults();
    onPreviewFile?.(null);
  }, [compressParams.parameters, selectedFiles]);

  const handleCompress = async () => {
    try {
      await compressOperation.executeOperation(
        compressParams.parameters,
        selectedFiles
      );
      if (compressOperation.files && onComplete) {
        onComplete(compressOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Compress operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'compress');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    compressOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('compress');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = compressOperation.files.length > 0 || compressOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = !hasFiles || hasResults;


  const steps = createToolSteps();

  return (
    <Stack gap="md" h="100%" p="sm" style={{ overflow: 'auto' }}>
      <ToolStepProvider>
        {/* Files Step */}
        {steps.createFilesStep({
          selectedFiles,
          isCollapsed: filesCollapsed
        })}

        {/* Settings Step */}
        {steps.create("Settings", {
          isCollapsed: settingsCollapsed,
          isCompleted: hasResults,
          onCollapsedClick: settingsCollapsed ? handleSettingsReset : undefined,
          completedMessage: t("compress.header", "Compression completed"),
          tooltip: compressTips
        }, (
          <Stack gap="md">
            <CompressSettings
              parameters={compressParams.parameters}
              onParameterChange={compressParams.updateParameter}
              disabled={endpointLoading}
            />
          </Stack>
        ))}
        <OperationButton
              onClick={handleCompress}
              isLoading={compressOperation.isLoading}
              disabled={!compressParams.validateParameters() || !hasFiles || !endpointEnabled}
              loadingText={t("loading")}
              submitText={t("compress.submit", "Compress")}
            />
        {/* Results Step */}
        {steps.createResultsStep({
          isVisible: hasResults,
          operation: compressOperation,
          title: t("compress.title", "Compression Results"),
          onFileClick: handleThumbnailClick
        })}
      </ToolStepProvider>
    </Stack>
  );
}


export default Compress;
