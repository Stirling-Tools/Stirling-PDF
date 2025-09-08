import { Stack } from "@mantine/core";
import { RedactParameters } from "../../../hooks/tools/redact/useRedactParameters";
import RedactModeSelector from "./RedactModeSelector";
import AutomaticRedactSettings from "./AutomaticRedactSettings";

interface RedactSettingsProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(key: K, value: RedactParameters[K]) => void;
  disabled?: boolean;
}

const RedactSettings = ({ parameters, onParameterChange, disabled = false }: RedactSettingsProps) => {
  return (
    <Stack gap="md">
      <RedactModeSelector
        mode={parameters.mode}
        onModeChange={(mode) => onParameterChange('mode', mode)}
        disabled={disabled}
      />

      {parameters.mode === 'automatic' && (
        <AutomaticRedactSettings
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
        />
      )}

      {parameters.mode === 'manual' && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          Manual redaction interface will be available here when implemented.
        </div>
      )}
    </Stack>
  );
};

export default RedactSettings;
