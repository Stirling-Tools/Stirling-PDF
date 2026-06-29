/**
 * AddWatermarkSingleStepSettings - Used for automation only
 *
 * This component combines all watermark settings into a single step interface
 * for use in the automation system. It includes type selection and all relevant
 * settings in one unified component.
 */

import { Stack } from "@mantine/core";
import { AddWatermarkParameters } from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";
import WatermarkTypeSettings from "@app/components/tools/addWatermark/WatermarkTypeSettings";
import WatermarkWording from "@app/components/tools/addWatermark/WatermarkWording";
import WatermarkTextStyle from "@app/components/tools/addWatermark/WatermarkTextStyle";
import WatermarkImageFile from "@app/components/tools/addWatermark/WatermarkImageFile";
import WatermarkFormatting from "@app/components/tools/addWatermark/WatermarkFormatting";

interface AddWatermarkSingleStepSettingsProps {
  parameters: AddWatermarkParameters;
  onParameterChange: <K extends keyof AddWatermarkParameters>(
    key: K,
    value: AddWatermarkParameters[K],
  ) => void;
  disabled?: boolean;
  /** When false, hide the "Flatten PDF pages to images" option (e.g. in policies). */
  showFlatten?: boolean;
}

const AddWatermarkSingleStepSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  showFlatten = true,
}: AddWatermarkSingleStepSettingsProps) => {
  return (
    <Stack gap="lg">
      {/* Watermark Type Selection */}
      <WatermarkTypeSettings
        watermarkType={parameters.watermarkType}
        onWatermarkTypeChange={(type) =>
          onParameterChange("watermarkType", type)
        }
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
          showFlatten={showFlatten}
        />
      )}
    </Stack>
  );
};

export default AddWatermarkSingleStepSettings;
