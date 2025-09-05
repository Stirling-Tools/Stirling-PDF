/**
 * AddWatermarkSingleStepSettings - Used for automation only
 * 
 * This component combines all watermark settings into a single step interface
 * for use in the automation system. It includes type selection and all relevant
 * settings in one unified component.
 */

import React from "react";
import { Stack } from "@mantine/core";
import { AddWatermarkParameters } from "../../../hooks/tools/addWatermark/useAddWatermarkParameters";
import WatermarkTypeSettings from "./WatermarkTypeSettings";
import WatermarkWording from "./WatermarkWording";
import WatermarkTextStyle from "./WatermarkTextStyle";
import WatermarkImageFile from "./WatermarkImageFile";
import WatermarkFormatting from "./WatermarkFormatting";

interface AddWatermarkSingleStepSettingsProps {
  parameters: AddWatermarkParameters;
  onParameterChange: <K extends keyof AddWatermarkParameters>(key: K, value: AddWatermarkParameters[K]) => void;
  disabled?: boolean;
}

const AddWatermarkSingleStepSettings = ({ parameters, onParameterChange, disabled = false }: AddWatermarkSingleStepSettingsProps) => {
  return (
    <Stack gap="lg">
      {/* Watermark Type Selection */}
      <WatermarkTypeSettings
        parameters={parameters}
        onParameterChange={onParameterChange}
        disabled={disabled}
      />

      {/* Conditional settings based on watermark type */}
      {parameters.watermarkType === "text" && (
        <>
          <WatermarkWording
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
          <WatermarkTextStyle
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

      {parameters.watermarkType === "image" && (
        <WatermarkImageFile
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
        />
      )}

      {/* Formatting settings for both text and image */}
      {parameters.watermarkType && (
        <WatermarkFormatting
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
        />
      )}
    </Stack>
  );
};

export default AddWatermarkSingleStepSettings;