import React, { useEffect, useMemo, useState } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import DownloadIcon from "@mui/icons-material/Download";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import ToolStep, { ToolStepContainer } from "../components/tools/shared/ToolStep";
import OperationButton from "../components/tools/shared/OperationButton";
import ErrorNotification from "../components/tools/shared/ErrorNotification";
import FileStatusIndicator from "../components/tools/shared/FileStatusIndicator";
import ResultsPreview from "../components/tools/shared/ResultsPreview";

import WatermarkTypeSettings from "../components/tools/addWatermark/WatermarkTypeSettings";
import WatermarkContentSettings from "../components/tools/addWatermark/WatermarkContentSettings";
import WatermarkStyleSettings from "../components/tools/addWatermark/WatermarkStyleSettings";

import { useAddWatermarkParameters } from "../hooks/tools/addWatermark/useAddWatermarkParameters";
import { useAddWatermarkOperation } from "../hooks/tools/addWatermark/useAddWatermarkOperation";
import { BaseToolProps } from "../types/tool";

const AddWatermark = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const watermarkParams = useAddWatermarkParameters();
  const watermarkOperation = useAddWatermarkOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("add-watermark");

  useEffect(() => {
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
  }, [watermarkParams.parameters, selectedFiles]);

  const handleAddWatermark = async () => {
    try {
      await watermarkOperation.executeOperation(
        watermarkParams.parameters,
        selectedFiles
      );
      if (watermarkOperation.files && onComplete) {
        onComplete(watermarkOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Add watermark operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'watermark');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('watermark');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = watermarkOperation.files.length > 0 || watermarkOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  
  // Step completion logic  
  const typeStepCompleted = hasFiles && !!watermarkParams.parameters.watermarkType;
  const contentStepCompleted = typeStepCompleted && (
    (watermarkParams.parameters.watermarkType === 'text' && watermarkParams.parameters.watermarkText.trim().length > 0) ||
    (watermarkParams.parameters.watermarkType === 'image' && watermarkParams.parameters.watermarkImage !== undefined)
  );
  const styleStepCompleted = contentStepCompleted; // Style step has defaults, so completed when content is done
  
  // Track which steps have been manually opened
  const [manuallyOpenedSteps, setManuallyOpenedSteps] = useState<Set<string>>(new Set());
  
  // Auto-collapse logic with manual override
  const typeStepCollapsed = typeStepCompleted && !hasResults && !manuallyOpenedSteps.has('type');
  const contentStepCollapsed = contentStepCompleted && !hasResults && !manuallyOpenedSteps.has('content');
  const styleStepCollapsed = !manuallyOpenedSteps.has('style'); // Style starts collapsed, only opens when clicked
  
  // Click handlers to manage step visibility and reset results
  const handleTypeStepClick = () => {
    setManuallyOpenedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has('type')) {
        newSet.delete('type'); // Close if already open
      } else {
        newSet.add('type'); // Open if closed
      }
      return newSet;
    });
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
  };
  
  const handleContentStepClick = () => {
    setManuallyOpenedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has('content')) {
        newSet.delete('content'); // Close if already open
      } else {
        newSet.add('content'); // Open if closed
      }
      return newSet;
    });
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
  };
  
  const handleStyleStepClick = () => {
    setManuallyOpenedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has('style')) {
        newSet.delete('style'); // Close if already open
      } else {
        newSet.add('style'); // Open if closed
      }
      return newSet;
    });
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
  };

  const previewResults = useMemo(() =>
    watermarkOperation.files?.map((file, index) => ({
      file,
      thumbnail: watermarkOperation.thumbnails[index]
    })) || [],
    [watermarkOperation.files, watermarkOperation.thumbnails]
  );

  return (
    <ToolStepContainer>
      <Stack gap="sm" h="100%" p="sm" style={{ overflow: 'auto' }}>
        {/* Files Step */}
        <ToolStep
          title="Files"
          isVisible={true}
          isCollapsed={filesCollapsed}
          isCompleted={filesCollapsed}
          completedMessage={hasFiles ?
            selectedFiles.length === 1
              ? `Selected: ${selectedFiles[0].name}`
              : `Selected: ${selectedFiles.length} files`
            : undefined}
        >
          <FileStatusIndicator
            selectedFiles={selectedFiles}
            placeholder="Select a PDF file in the main view to get started"
          />
        </ToolStep>

        {/* Watermark Type Step */}
        <ToolStep
          title="Watermark Type"
          isVisible={hasFiles}
          isCollapsed={typeStepCollapsed}
          isCompleted={typeStepCompleted}
          onCollapsedClick={handleTypeStepClick}
          completedMessage={typeStepCompleted ? 
            `Type: ${watermarkParams.parameters.watermarkType === 'text' ? 'Text' : 'Image'}` : undefined}
        >
          <WatermarkTypeSettings
            watermarkType={watermarkParams.parameters.watermarkType}
            onWatermarkTypeChange={(type) => watermarkParams.updateParameter('watermarkType', type)}
            disabled={endpointLoading}
          />
        </ToolStep>

        {/* Content Step */}
        <ToolStep
          title={watermarkParams.parameters.watermarkType === 'text' ? "Text Content" : "Image Content"}
          isVisible={typeStepCompleted}
          isCollapsed={contentStepCollapsed}
          isCompleted={contentStepCompleted}
          onCollapsedClick={handleContentStepClick}
          completedMessage={contentStepCompleted ? 
            (watermarkParams.parameters.watermarkType === 'text' 
              ? `Text: "${watermarkParams.parameters.watermarkText}"` 
              : `Image: ${watermarkParams.parameters.watermarkImage?.name}`) : undefined}
        >
          <WatermarkContentSettings
            parameters={watermarkParams.parameters}
            onParameterChange={watermarkParams.updateParameter}
            disabled={endpointLoading}
          />
        </ToolStep>

        {/* Style Step */}
        <ToolStep
          title="Style & Position (Optional)"
          isVisible={contentStepCompleted}
          isCollapsed={styleStepCollapsed}
          isCompleted={styleStepCompleted}
          onCollapsedClick={handleStyleStepClick}
          completedMessage={styleStepCompleted ? 
            `Opacity: ${watermarkParams.parameters.opacity}%, Rotation: ${watermarkParams.parameters.rotation}°` : undefined}
        >
          <WatermarkStyleSettings
            parameters={watermarkParams.parameters}
            onParameterChange={watermarkParams.updateParameter}
            disabled={endpointLoading}
          />
        </ToolStep>

        {/* Apply Button - Outside of settings steps */}
        {styleStepCompleted && !hasResults && (
          <Stack gap="sm" p="md">
            <OperationButton
              onClick={handleAddWatermark}
              isLoading={watermarkOperation.isLoading}
              disabled={!watermarkParams.validateParameters() || !hasFiles || !endpointEnabled}
              loadingText={t("loading")}
              submitText="Add Watermark and Review"
            />
          </Stack>
        )}

        {/* Results Step */}
        <ToolStep
          title="Results"
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {watermarkOperation.status && (
              <Text size="sm" c="dimmed">{watermarkOperation.status}</Text>
            )}

            <ErrorNotification
              error={watermarkOperation.errorMessage}
              onClose={watermarkOperation.clearError}
            />

            {watermarkOperation.downloadUrl && (
              <Button
                component="a"
                href={watermarkOperation.downloadUrl}
                download={watermarkOperation.downloadFilename}
                leftSection={<DownloadIcon />}
                color="green"
                fullWidth
                mb="md"
              >
                {t("download", "Download")}
              </Button>
            )}

            <ResultsPreview
              files={previewResults}
              onFileClick={handleThumbnailClick}
              isGeneratingThumbnails={watermarkOperation.isGeneratingThumbnails}
              title="Watermark Results"
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default AddWatermark;