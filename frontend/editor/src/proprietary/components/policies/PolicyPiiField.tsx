import { MultiSelect } from "@mantine/core";

/**
 * Friendly PII presets for the redact step. Each maps to the regex the
 * /auto-redact endpoint matches (via `wordsToRedact` + `useRegex`), so users
 * pick "Social Security numbers" instead of typing `\b\d{3}-\d{2}-\d{4}\b`.
 * The SSN/card/account patterns match DEFAULT_PII_PATTERNS so seeded policies
 * show those presets pre-selected.
 */
export const PII_PRESETS: { value: string; label: string; pattern: string }[] =
  [
    {
      value: "ssn",
      label: "Social Security numbers",
      pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
    },
    {
      value: "card",
      label: "Credit / debit cards",
      pattern: "\\b(?:\\d[ -]*?){13,16}\\b",
    },
    {
      value: "account",
      label: "Bank account numbers",
      pattern: "\\b\\d{8,17}\\b",
    },
    {
      value: "email",
      label: "Email addresses",
      pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+",
    },
    {
      value: "phone",
      label: "Phone numbers",
      pattern: "\\b\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b",
    },
  ];

const PATTERN_BY_VALUE = new Map(PII_PRESETS.map((p) => [p.value, p.pattern]));
const VALUE_BY_PATTERN = new Map(PII_PRESETS.map((p) => [p.pattern, p.value]));
const PRESET_PATTERNS = new Set(PII_PRESETS.map((p) => p.pattern));

interface PolicyPiiFieldProps {
  parameters: Record<string, unknown>;
  onChange: (parameters: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Quick-add for common PII types. Selecting a preset drops its regex into the
 * redact step's `wordsToRedact` (as automatic + regex); the pattern is then
 * editable in the word list below. Custom/edited patterns are left untouched —
 * this only manages the preset entries, so it's a convenience layered on top of
 * the raw list rather than a replacement for it.
 */
export function PolicyPiiField({
  parameters,
  onChange,
  disabled,
}: PolicyPiiFieldProps) {
  const words = Array.isArray(parameters.wordsToRedact)
    ? (parameters.wordsToRedact as string[])
    : [];
  // A preset reads as "selected" only while its exact pattern is still present;
  // editing it in the list below turns it into a custom entry and clears the chip.
  const selected = words
    .map((w) => VALUE_BY_PATTERN.get(w))
    .filter((v): v is string => Boolean(v));

  const handleChange = (values: string[]) => {
    const presetPatterns = values
      .map((v) => PATTERN_BY_VALUE.get(v))
      .filter((p): p is string => Boolean(p));
    // Preserve anything the user typed or edited; only swap the preset entries.
    const customWords = words.filter((w) => !PRESET_PATTERNS.has(w));
    onChange({
      ...parameters,
      mode: "automatic",
      useRegex: true,
      wordsToRedact: [...presetPatterns, ...customWords],
    });
  };

  return (
    <MultiSelect
      size="sm"
      label="Quick-add common PII"
      placeholder="Add a PII type"
      data={PII_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
      value={selected}
      onChange={handleChange}
      disabled={disabled}
      clearable
      checkIconPosition="right"
    />
  );
}
