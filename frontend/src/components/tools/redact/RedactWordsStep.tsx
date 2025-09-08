import { Stack } from '@mantine/core';
import { RedactParameters } from '../../../hooks/tools/redact/useRedactParameters';
import WordsToRedactInput from './WordsToRedactInput';

interface RedactWordsStepProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(key: K, value: RedactParameters[K]) => void;
  disabled?: boolean;
}

export default function RedactWordsStep({ parameters, onParameterChange, disabled }: RedactWordsStepProps) {
  return (
    <Stack gap="md">
      <WordsToRedactInput
        wordsToRedact={parameters.wordsToRedact}
        onWordsChange={(words) => onParameterChange('wordsToRedact', words)}
        disabled={disabled}
      />
    </Stack>
  );
}
