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
  /** When true, lock to text watermarks: hide the type selector and image option (e.g. in policies). */
  textOnly?: boolean;
}

const AddWatermarkSingleStepSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  showFlatten = true,
  textOnly = false,
}: AddWatermarkSingleStepSettingsProps) => {
  const isText = textOnly || parameters.watermarkType === "text";
  const isImage = !textOnly && parameters.watermarkType === "image";
  return (
    <Stack gap="lg">
      {/* Watermark type selection — hidden when locked to text. */}
      {!textOnly && (
        <WatermarkTypeSettings
          watermarkType={parameters.watermarkType}
          onWatermarkTypeChange={(type) =>
            onParameterChange("watermarkType", type)
          }
          disabled={disabled}
        />
      )}

      {isText && (
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

      {isImage && (
        <WatermarkImageFile
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
        />
      )}

      {/* Formatting settings for both text and image */}
      {(textOnly || parameters.watermarkType) && (
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
