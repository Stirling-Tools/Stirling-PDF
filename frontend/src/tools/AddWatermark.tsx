import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import WatermarkTypeSettings from "../components/tools/addWatermark/WatermarkTypeSettings";
import WatermarkContentSettings from "../components/tools/addWatermark/WatermarkContentSettings";
import WatermarkStyleSettings from "../components/tools/addWatermark/WatermarkStyleSettings";
import WatermarkAdvancedSettings from "../components/tools/addWatermark/WatermarkAdvancedSettings";

import { useAddWatermarkParameters } from "../hooks/tools/addWatermark/useAddWatermarkParameters";
import { useAddWatermarkOperation } from "../hooks/tools/addWatermark/useAddWatermarkOperation";
import { useWatermarkTypeTips, useWatermarkContentTips, useWatermarkStyleTips, useWatermarkAdvancedTips } from "../components/tooltips/useWatermarkTips";
import { BaseToolProps } from "../types/tool";

const AddWatermark = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const [collapsedType, setCollapsedType] = useState(false);
  const [collapsedStyle, setCollapsedStyle] = useState(true);
  const [collapsedAdvanced, setCollapsedAdvanced] = useState(true);

  const watermarkParams = useAddWatermarkParameters();
  const watermarkOperation = useAddWatermarkOperation();
  const watermarkTypeTips = useWatermarkTypeTips();
  const watermarkContentTips = useWatermarkContentTips();
  const watermarkStyleTips = useWatermarkStyleTips();
  const watermarkAdvancedTips = useWatermarkAdvancedTips();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("add-watermark");

  useEffect(() => {
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
  }, [watermarkParams.parameters]);

  // Auto-collapse type step after selection
  useEffect(() => {
    if (watermarkParams.parameters.watermarkType && !collapsedType) {
      setCollapsedType(true);
    }
  }, [watermarkParams.parameters.watermarkType]);

  const handleAddWatermark = async () => {
    try {
      await watermarkOperation.executeOperation(watermarkParams.parameters, selectedFiles);
      if (watermarkOperation.files && onComplete) {
        onComplete(watermarkOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("watermark.error.failed", "Add watermark operation failed"));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "watermark");
    setCurrentMode("viewer");
  };

  const handleSettingsReset = () => {
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode("watermark");
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = watermarkOperation.files.length > 0 || watermarkOperation.downloadUrl !== null;
  const settingsCollapsed = !hasFiles || hasResults;

  // Step completion logic
  const typeStepCompleted = hasFiles && !!watermarkParams.parameters.watermarkType;
  const contentStepCompleted = typeStepCompleted && (
    (watermarkParams.parameters.watermarkType === 'text' && watermarkParams.parameters.watermarkText.trim().length > 0) ||
    (watermarkParams.parameters.watermarkType === 'image' && watermarkParams.parameters.watermarkImage !== undefined)
  );

  // Step visibility logic - all steps always visible once files are selected
  const styleCollapsed = collapsedStyle || hasResults;
  const advancedCollapsed = collapsedAdvanced || hasResults;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasFiles || hasResults,
    },
    steps: [
      {
        title: t("watermark.steps.type", "Watermark Type"),
        isCollapsed: settingsCollapsed? true : collapsedType,
        onCollapsedClick: hasResults ? handleSettingsReset : () => setCollapsedType(!collapsedType),
        tooltip: watermarkTypeTips,
        content: (
          <WatermarkTypeSettings
            watermarkType={watermarkParams.parameters.watermarkType}
            onWatermarkTypeChange={(type) => watermarkParams.updateParameter('watermarkType', type)}
            disabled={endpointLoading}
          />
        ),
      },
      {
        title: watermarkParams.parameters.watermarkType === 'text'
          ? t("watermark.steps.textContent", "Text Content")
          : t("watermark.steps.imageContent", "Image Content"),
        isCollapsed: settingsCollapsed? true : contentStepCompleted,
        tooltip: watermarkContentTips,
        content: (
          <WatermarkContentSettings
            parameters={watermarkParams.parameters}
            onParameterChange={watermarkParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
      {
        title: t("watermark.steps.style", "Style & Position"),
        isCollapsed: settingsCollapsed? true : styleCollapsed,
        onCollapsedClick: hasResults ? handleSettingsReset : () => setCollapsedStyle(!collapsedStyle),
        tooltip: watermarkStyleTips,
        content: (
          <WatermarkStyleSettings
            parameters={watermarkParams.parameters}
            onParameterChange={watermarkParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
      {
        title: t("watermark.steps.advanced", "Advanced Options"),
        isCollapsed: settingsCollapsed? true : advancedCollapsed,
        onCollapsedClick: hasResults ? handleSettingsReset : () => setCollapsedAdvanced(!collapsedAdvanced),
        tooltip: watermarkAdvancedTips,
        content: (
          <WatermarkAdvancedSettings
            parameters={watermarkParams.parameters}
            onParameterChange={watermarkParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("watermark.submit", "Add Watermark"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleAddWatermark,
      disabled: !watermarkParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: watermarkOperation,
      title: t("watermark.results.title", "Watermark Results"),
      onFileClick: handleThumbnailClick,
    },
  });
}

export default AddWatermark;
