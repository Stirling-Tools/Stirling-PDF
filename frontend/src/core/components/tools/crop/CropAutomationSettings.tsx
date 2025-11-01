/**
 * CropAutomationSettings - Used for automation only
 *
 * Simplified crop settings for automation that doesn't require a file preview.
 * Allows users to manually enter crop coordinates and dimensions.
 */

import { Stack } from "@mantine/core";
import { CropParameters } from "@app/hooks/tools/crop/useCropParameters";
import { Rectangle } from "@app/utils/cropCoordinates";
import CropCoordinateInputs from "@app/components/tools/crop/CropCoordinateInputs";

interface CropAutomationSettingsProps {
  parameters: CropParameters;
  onParameterChange: <K extends keyof CropParameters>(key: K, value: CropParameters[K]) => void;
  disabled?: boolean;
}

const CropAutomationSettings = ({ parameters, onParameterChange, disabled = false }: CropAutomationSettingsProps) => {
  // Handle coordinate changes
  const handleCoordinateChange = (field: keyof Rectangle, value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return;

    const newCropArea = { ...parameters.cropArea, [field]: numValue };
    onParameterChange('cropArea', newCropArea);
  };

  return (
    <Stack gap="md">
      <CropCoordinateInputs
        cropArea={parameters.cropArea}
        onCoordinateChange={handleCoordinateChange}
        disabled={disabled}
        showAutomationInfo={true}
      />
    </Stack>
  );
};

export default CropAutomationSettings;
