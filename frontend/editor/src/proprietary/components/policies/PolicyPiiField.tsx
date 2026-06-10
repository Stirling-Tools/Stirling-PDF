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

/** The set of preset regexes — used to separate preset words from custom ones. */
export const PRESET_PATTERNS = new Set(PII_PRESETS.map((p) => p.pattern));
const PATTERN_BY_VALUE = new Map(PII_PRESETS.map((p) => [p.value, p.pattern]));
const VALUE_BY_PATTERN = new Map(PII_PRESETS.map((p) => [p.pattern, p.value]));

interface PolicyPiiFieldProps {
  parameters: Record<string, unknown>;
  onChange: (parameters: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * The redact step's PII preset picker — a dropdown of common PII types that
 * writes the matching regexes into `wordsToRedact` (automatic + regex). It only
 * manages the preset entries; any custom patterns the user added separately are
 * left untouched, so this sits alongside the custom-entry field rather than
 * owning the whole list.
 */
export function PolicyPiiField({
  parameters,
  onChange,
  disabled,
}: PolicyPiiFieldProps) {
  const words = Array.isArray(parameters.wordsToRedact)
    ? (parameters.wordsToRedact as string[])
    : [];
  const selected = words
    .map((w) => VALUE_BY_PATTERN.get(w))
    .filter((v): v is string => Boolean(v));

  const handleChange = (values: string[]) => {
    const presetPatterns = values
      .map((v) => PATTERN_BY_VALUE.get(v))
      .filter((p): p is string => Boolean(p));
    // Keep the user's custom patterns; only swap the preset selection.
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
      label="PII to redact"
      placeholder="Select PII types"
      data={PII_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
      value={selected}
      onChange={handleChange}
      disabled={disabled}
      clearable
      checkIconPosition="right"
    />
  );
}
