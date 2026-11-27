import { Stack } from "@mantine/core";
import type { RedactParameters } from "@editor/hooks/tools/redact/useRedactParameters";
import { RedactPresetSelect } from "@editor/components/tools/redact/RedactPresetSelect";
import WordsToRedactInput from "@editor/components/tools/redact/WordsToRedactInput";
import {
  customWordsForDisplay,
  selectedPresetIds,
  withCustomWordAdded,
  withCustomWordRemoved,
  withPresets,
  type RedactWords,
} from "@editor/components/tools/redact/redactWords";

interface RedactWordsSettingsProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(
    key: K,
    value: RedactParameters[K],
  ) => void;
  disabled?: boolean;
}

export default function RedactWordsSettings({
  parameters,
  onParameterChange,
  disabled,
}: RedactWordsSettingsProps) {
  const apply = (next: RedactWords) => {
    onParameterChange("wordsToRedact", next.wordsToRedact);
    if (next.useRegex !== parameters.useRegex) {
      onParameterChange("useRegex", next.useRegex);
    }
  };

  return (
    <Stack gap="md">
      <RedactPresetSelect
        value={selectedPresetIds(parameters)}
        onChange={(ids) => apply(withPresets(parameters, ids))}
        disabled={disabled}
      />
      <WordsToRedactInput
        wordsToRedact={customWordsForDisplay(parameters)}
        onAddWord={(word) => apply(withCustomWordAdded(parameters, word))}
        onRemoveWord={(index) =>
          apply(withCustomWordRemoved(parameters, index))
        }
        disabled={disabled}
      />
    </Stack>
  );
}
