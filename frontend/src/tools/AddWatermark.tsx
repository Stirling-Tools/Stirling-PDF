import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useToolFileSelection } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import WatermarkTypeSettings from "../components/tools/addWatermark/WatermarkTypeSettings";
import WatermarkWording from "../components/tools/addWatermark/WatermarkWording";
import WatermarkTextStyle from "../components/tools/addWatermark/WatermarkTextStyle";
import WatermarkImageFile from "../components/tools/addWatermark/WatermarkImageFile";
import WatermarkFormatting from "../components/tools/addWatermark/WatermarkFormatting";

import { useAddWatermarkParameters } from "../hooks/tools/addWatermark/useAddWatermarkParameters";
import { useAddWatermarkOperation } from "../hooks/tools/addWatermark/useAddWatermarkOperation";
import {
  useWatermarkTypeTips,
  useWatermarkWordingTips,
  useWatermarkTextStyleTips,
  useWatermarkFileTips,
  useWatermarkFormattingTips,
} from "../components/tooltips/useWatermarkTips";
import { BaseToolProps } from "../types/tool";

const AddWatermark = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions } = useNavigationActions();
  const { selectedFiles } = useToolFileSelection();

  const [collapsedType, setCollapsedType] = useState(false);
  const [collapsedStyle, setCollapsedStyle] = useState(true);
  const [collapsedFormatting, setCollapsedFormatting] = useState(true);

  const watermarkParams = useAddWatermarkParameters();
  const watermarkOperation = useAddWatermarkOperation();
  const watermarkTypeTips = useWatermarkTypeTips();
  const watermarkWordingTips = useWatermarkWordingTips();
  const watermarkTextStyleTips = useWatermarkTextStyleTips();
  const watermarkFileTips = useWatermarkFileTips();
  const watermarkFormattingTips = useWatermarkFormattingTips();

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
  };

  const handleSettingsReset = () => {
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = watermarkOperation.files.length > 0 || watermarkOperation.downloadUrl !== null;

  // Dynamic step structure based on watermark type
  const getSteps = () => {
    const steps = [];

    steps.push({
      title: t("watermark.steps.type", "Watermark Type"),
      isCollapsed: hasResults ? true : collapsedType,
      isVisible: hasFiles || hasResults,
      onCollapsedClick: hasResults ? handleSettingsReset : () => setCollapsedType(!collapsedType),
      tooltip: watermarkTypeTips,
      content: (
        <WatermarkTypeSettings
          watermarkType={watermarkParams.parameters.watermarkType}
          onWatermarkTypeChange={(type) => watermarkParams.updateParameter("watermarkType", type)}
          disabled={endpointLoading}
        />
      ),
    });

    if (hasFiles || hasResults) {
      // Text watermark path
      if (watermarkParams.parameters.watermarkType === "text") {
        // Step 2: Wording
        steps.push({
          title: t("watermark.steps.wording", "Wording"),
          isCollapsed: hasResults,
          tooltip: watermarkWordingTips,
          content: (
            <WatermarkWording
              parameters={watermarkParams.parameters}
              onParameterChange={watermarkParams.updateParameter}
              disabled={endpointLoading}
            />
          ),
        });

        // Step 3: Style
        steps.push({
          title: t("watermark.steps.textStyle", "Style"),
          isCollapsed: hasResults ? true : collapsedStyle,
          onCollapsedClick: hasResults ? handleSettingsReset : () => setCollapsedStyle(!collapsedStyle),
          tooltip: watermarkTextStyleTips,
          content: (
            <WatermarkTextStyle
              parameters={watermarkParams.parameters}
              onParameterChange={watermarkParams.updateParameter}
              disabled={endpointLoading}
            />
          ),
        });

        // Step 4: Formatting
        steps.push({
          title: t("watermark.steps.formatting", "Formatting"),
          isCollapsed: hasResults ? true : collapsedFormatting,
          onCollapsedClick: hasResults ? handleSettingsReset : () => setCollapsedFormatting(!collapsedFormatting),
          tooltip: watermarkFormattingTips,
          content: (
            <WatermarkFormatting
              parameters={watermarkParams.parameters}
              onParameterChange={watermarkParams.updateParameter}
              disabled={endpointLoading}
            />
          ),
        });
      }

      // Image watermark path
      if (watermarkParams.parameters.watermarkType === "image") {
        // Step 2: Watermark File
        steps.push({
          title: t("watermark.steps.file", "Watermark File"),
          isCollapsed: hasResults,
          tooltip: watermarkFileTips,
          content: (
            <WatermarkImageFile
              parameters={watermarkParams.parameters}
              onParameterChange={watermarkParams.updateParameter}
              disabled={endpointLoading}
            />
          ),
        });

        // Step 3: Formatting
        steps.push({
          title: t("watermark.steps.formatting", "Formatting"),
          isCollapsed: hasResults ? true : collapsedFormatting,
          onCollapsedClick: hasResults ? handleSettingsReset : () => setCollapsedFormatting(!collapsedFormatting),
          tooltip: watermarkFormattingTips,
          content: (
            <WatermarkFormatting
              parameters={watermarkParams.parameters}
              onParameterChange={watermarkParams.updateParameter}
              disabled={endpointLoading}
            />
          ),
        });
      }
    }

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps: getSteps(),
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
    forceStepNumbers: true,
  });
};

export default AddWatermark;
