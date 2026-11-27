export type RedactPresetId =
  | "ssn"
  | "card"
  | "iban"
  | "routing"
  | "account"
  | "email"
  | "phone";

export interface RedactPreset {
  id: RedactPresetId;
  /** English label; the fallback for the `redact.presets.<id>` translation. */
  label: string;
  /** Java regex the auto-redact endpoint matches with `useRegex` on. */
  pattern: string;
}

/**
 * Common types for automatic redaction. Patterns are precise (validated SSN
 * areas, card IINs, ABA prefixes; context- or separator-anchored) to keep false
 * positives down and avoid catastrophic backtracking.
 *
 * Saved automations, suggestions and policies store the pattern text, not the
 * id, so editing a pattern turns every saved copy into a custom entry.
 */
export const REDACT_PRESETS: readonly RedactPreset[] = [
  {
    id: "ssn",
    label: "Social Security numbers",
    // 123-45-6789 or 123 45 6789; rejects invalid areas (000/666/9xx),
    // group 00, serial 0000, and mixed separators (backreference).
    pattern:
      "\\b(?!000|666|9\\d{2})\\d{3}([- ])(?!00)\\d{2}\\1(?!0000)\\d{4}\\b",
  },
  {
    id: "card",
    label: "Credit / debit cards",
    // Solid runs anchored to real IINs (Visa 13/16, MC 51-55 + 2221-2720,
    // Amex 34/37, Discover 6011/65xx) + grouped 4-4-4-4 and Amex 4-6-5
    // with a consistent separator enforced by backreference.
    pattern:
      "\\b(?:4\\d{12}(?:\\d{3})?|5[1-5]\\d{14}|(?:222[1-9]|22[3-9]\\d|2[3-6]\\d{2}|27[01]\\d|2720)\\d{12}|3[47]\\d{13}|6(?:011|5\\d{2})\\d{12}|[2-6]\\d{3}([ -])\\d{4}\\1\\d{4}\\1\\d{4}|3[47]\\d{2}([ -])\\d{6}\\2\\d{5})\\b",
  },
  {
    id: "iban",
    label: "IBANs",
    // Solid (GB29NWBK...) or space-grouped (GB29 NWBK 6016 ...) form.
    pattern:
      "\\b[A-Z]{2}\\d{2}(?:[A-Z0-9]{11,30}|(?: [A-Z0-9]{4}){2,7}(?: [A-Z0-9]{1,4})?)\\b",
  },
  {
    id: "routing",
    label: "US routing numbers",
    // 9 digits constrained to valid Federal Reserve prefix ranges.
    pattern: "\\b(?:0[1-9]|1[0-2]|2[1-9]|3[0-2]|6[1-9]|7[0-2]|80)\\d{7}\\b",
  },
  {
    id: "account",
    label: "Labelled account numbers",
    // Context-anchored: only digits preceded by Account / Acct / A/C.
    pattern:
      "\\b(?:[Aa]cc(?:oun)?t|[Aa]/[Cc])(?:\\s+(?:[Nn]o\\.?|[Nn]umber|#))?\\s*[:#]?\\s*\\d{6,17}\\b",
  },
  {
    id: "email",
    label: "Email addresses",
    // Requires a real TLD (2+ letters); won't swallow a sentence-ending period.
    pattern:
      "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}\\b",
  },
  {
    id: "phone",
    label: "Phone numbers",
    // (555) 123-4567, 555-123-4567 (consistent separator), +E.164 solid or
    // grouped, UK 0-prefixed grouped formats. Bare 10-digit runs excluded.
    pattern:
      "\\(\\d{3}\\)[ .-]?\\d{3}[ .-]?\\d{4}\\b|\\b\\d{3}([ .-])\\d{3}\\1\\d{4}\\b|\\+\\d{1,3}[ .-]?\\d{6,12}\\b|\\+\\d{1,3}(?:[ .-]\\d{2,4}){2,5}\\b|\\b0\\d{2,4}[ -]\\d{3,4}[ -]?\\d{3,4}\\b",
  },
];

const PRESET_BY_PATTERN = new Map(REDACT_PRESETS.map((p) => [p.pattern, p.id]));
const PATTERN_BY_ID = new Map(REDACT_PRESETS.map((p) => [p.id, p.pattern]));

export function isRedactPresetId(value: string): value is RedactPresetId {
  return REDACT_PRESETS.some((p) => p.id === value);
}

export function presetIdOfPattern(pattern: string): RedactPresetId | undefined {
  return PRESET_BY_PATTERN.get(pattern);
}

export function presetPatterns(ids: readonly RedactPresetId[]): string[] {
  return ids.flatMap((id) => PATTERN_BY_ID.get(id) ?? []);
}
