/**
 * AddStampAutomationSettings - Used for automation only
 *
 * This component combines all stamp settings into a single step interface
 * for use in the automation system. It includes setup and formatting
 * settings in one unified component.
 */

import { Stack } from "@mantine/core";
import { AddStampParameters } from "@app/components/tools/addStamp/useAddStampParameters";
import StampSetupSettings from "@app/components/tools/addStamp/StampSetupSettings";
import StampPositionFormattingSettings from "@app/components/tools/addStamp/StampPositionFormattingSettings";

interface AddStampAutomationSettingsProps {
  parameters: AddStampParameters;
  onParameterChange: <K extends keyof AddStampParameters>(key: K, value: AddStampParameters[K]) => void;
  disabled?: boolean;
}

const AddStampAutomationSettings = ({ parameters, onParameterChange, disabled = false }: AddStampAutomationSettingsProps) => {
  return (
    <Stack gap="lg">
      {/* Stamp Setup (Type, Text/Image, Page Selection) */}
      <StampSetupSettings
        parameters={parameters}
        onParameterChange={onParameterChange}
        disabled={disabled}
      />

      {/* Position and Formatting Settings */}
      {parameters.stampType && (
        <StampPositionFormattingSettings
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
          showPositionGrid={true}
        />
      )}
    </Stack>
  );
};

export default AddStampAutomationSettings;
