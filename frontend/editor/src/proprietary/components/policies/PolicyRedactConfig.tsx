import { Stack, Divider } from "@mantine/core";
import WordsToRedactInput from "@app/components/tools/redact/WordsToRedactInput";
import RedactAdvancedSettings from "@app/components/tools/redact/RedactAdvancedSettings";
import type { RedactParameters } from "@app/hooks/tools/redact/useRedactParameters";
import { PolicyPiiField } from "@app/components/policies/PolicyPiiField";

interface PolicyRedactConfigProps {
  parameters: Record<string, unknown>;
  onChange: (parameters: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Redact configuration for a policy: a PII quick-add on top of the redact tool's
 * own word/regex list and advanced options. The quick-add seeds preset patterns;
 * the word list makes those (and any custom ones) fully editable. Mode is fixed
 * to automatic — a policy runs headless, so manual redaction (which needs the
 * canvas) doesn't apply, and the mode selector is omitted on purpose.
 */
export function PolicyRedactConfig({
  parameters,
  onChange,
  disabled,
}: PolicyRedactConfigProps) {
  const words = Array.isArray(parameters.wordsToRedact)
    ? (parameters.wordsToRedact as string[])
    : [];

  const patchParam = <K extends keyof RedactParameters>(
    key: K,
    value: RedactParameters[K],
  ) => onChange({ ...parameters, [key]: value });

  return (
    <Stack gap="md">
      <PolicyPiiField
        parameters={parameters}
        onChange={onChange}
        disabled={disabled}
      />

      <Divider />

      <WordsToRedactInput
        wordsToRedact={words}
        onWordsChange={(next) =>
          onChange({ ...parameters, mode: "automatic", wordsToRedact: next })
        }
        disabled={disabled}
      />

      <Divider />

      <RedactAdvancedSettings
        parameters={parameters as unknown as RedactParameters}
        onParameterChange={patchParam}
        disabled={disabled}
      />
    </Stack>
  );
}
