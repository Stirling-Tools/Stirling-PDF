import { Stack, Divider } from "@mantine/core";
import { RedactParameters } from "@app/hooks/tools/redact/useRedactParameters";
import RedactModeSelector from "@app/components/tools/redact/RedactModeSelector";
import WordsToRedactInput from "@app/components/tools/redact/WordsToRedactInput";
import RedactAdvancedSettings from "@app/components/tools/redact/RedactAdvancedSettings";

interface RedactSingleStepSettingsProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(key: K, value: RedactParameters[K]) => void;
  disabled?: boolean;
}

const RedactSingleStepSettings = ({ parameters, onParameterChange, disabled = false }: RedactSingleStepSettingsProps) => {
  return (
    <Stack gap="md">
      {/* Mode Selection */}
      <RedactModeSelector
        mode={parameters.mode}
        onModeChange={(mode) => onParameterChange('mode', mode)}
        disabled={disabled}
      />

      {/* Automatic Mode Settings */}
      {parameters.mode === 'automatic' && (
        <>
          <Divider />

          {/* Words to Redact */}
          <WordsToRedactInput
            wordsToRedact={parameters.wordsToRedact}
            onWordsChange={(words) => onParameterChange('wordsToRedact', words)}
            disabled={disabled}
          />

          <Divider />

          {/* Advanced Settings */}
          <RedactAdvancedSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

      {/* Manual Mode Placeholder */}
      {parameters.mode === 'manual' && (
        <>
          <Divider />
          <Stack gap="md">
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              Manual redaction interface will be available here when implemented.
            </div>
          </Stack>
        </>
      )}
    </Stack>
  );
};

export default RedactSingleStepSettings;
