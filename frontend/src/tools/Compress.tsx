import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

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
  }, [compressParams.parameters]);

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
  const settingsCollapsed = !hasFiles || hasResults;

  return createToolFlow({
        files: {
          selectedFiles,
          isCollapsed: hasFiles && !hasResults,
        },
        steps: [{
          title: "Settings",
          isCollapsed: settingsCollapsed,
          onCollapsedClick: settingsCollapsed ? handleSettingsReset : undefined,
          tooltip: compressTips,
          content: (
            <CompressSettings
              parameters={compressParams.parameters}
              onParameterChange={compressParams.updateParameter}
              disabled={endpointLoading}
            />
          )
        }],
        executeButton: {
          text: t("compress.submit", "Compress"),
          isVisible: !hasResults,
          loadingText: t("loading"),
          onClick: handleCompress,
          disabled: !compressParams.validateParameters() || !hasFiles || !endpointEnabled
        },
        review: {
          isVisible: hasResults,
          operation: compressOperation,
          title: t("compress.title", "Compression Results"),
          onFileClick: handleThumbnailClick
        }
      });
}


export default Compress;
