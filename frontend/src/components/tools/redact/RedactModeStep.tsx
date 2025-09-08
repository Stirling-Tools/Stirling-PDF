import { Stack } from '@mantine/core';
import { RedactParameters } from '../../../hooks/tools/redact/useRedactParameters';
import RedactModeSelector from './RedactModeSelector';

interface RedactModeStepProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(key: K, value: RedactParameters[K]) => void;
  disabled?: boolean;
}

export default function RedactModeStep({ parameters, onParameterChange, disabled }: RedactModeStepProps) {
  return (
    <Stack gap="md">
      <RedactModeSelector
        mode={parameters.mode}
        onModeChange={(mode) => onParameterChange('mode', mode)}
        disabled={disabled}
      />
    </Stack>
  );
}
