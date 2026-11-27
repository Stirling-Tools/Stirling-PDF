import { Stack, Divider } from "@mantine/core";
import { RedactParameters } from "@editor/hooks/tools/redact/useRedactParameters";
import RedactWordsSettings from "@editor/components/tools/redact/RedactWordsSettings";
import RedactAdvancedSettings from "@editor/components/tools/redact/RedactAdvancedSettings";

interface RedactSingleStepSettingsProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(
    key: K,
    value: RedactParameters[K],
  ) => void;
  disabled?: boolean;
}

const RedactSingleStepSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: RedactSingleStepSettingsProps) => (
  <Stack gap="md">
    <RedactWordsSettings
      parameters={parameters}
      onParameterChange={onParameterChange}
      disabled={disabled}
    />

    <Divider />

    <RedactAdvancedSettings
      parameters={parameters}
      onParameterChange={onParameterChange}
      disabled={disabled}
    />
  </Stack>
);

export default RedactSingleStepSettings;
