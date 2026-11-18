/**
 * SplitAutomationSettings - Used for automation only
 *
 * Combines split method selection and method-specific settings
 * into a single component for automation workflows.
 */

import { Stack } from "@mantine/core";
import { SplitParameters } from "@editor/hooks/tools/split/useSplitParameters";
import { METHOD_OPTIONS } from "@editor/constants/splitConstants";
import SplitMethodSelect from "@editor/components/tools/split/SplitMethodSelect";
import SplitSettings from "@editor/components/tools/split/SplitSettings";

interface SplitAutomationSettingsProps {
  parameters: SplitParameters;
  onParameterChange: <K extends keyof SplitParameters>(
    key: K,
    value: SplitParameters[K],
  ) => void;
  disabled?: boolean;
}

const SplitAutomationSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: SplitAutomationSettingsProps) => (
  <Stack gap="md">
    <SplitMethodSelect
      options={METHOD_OPTIONS}
      value={parameters.method}
      onChange={(method) => onParameterChange("method", method)}
      disabled={disabled}
    />
    <SplitSettings
      parameters={parameters}
      onParameterChange={onParameterChange}
      disabled={disabled}
    />
  </Stack>
);

export default SplitAutomationSettings;
