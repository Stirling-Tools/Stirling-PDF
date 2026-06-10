import { useEffect } from "react";
import {
  Stack,
  Divider,
  ColorInput,
  NumberInput,
  Checkbox,
} from "@mantine/core";
import WordsToRedactInput from "@app/components/tools/redact/WordsToRedactInput";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";
import {
  PolicyPiiField,
  PRESET_PATTERNS,
} from "@app/components/policies/PolicyPiiField";

interface PolicyRedactConfigProps {
  parameters: Record<string, unknown>;
  onChange: (parameters: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Redact configuration for a policy: a PII preset dropdown plus a separate field
 * for the user's own words / regexes, then the advanced redact options. The two
 * lists are kept disjoint — the dropdown owns the preset patterns, the custom
 * field owns everything else — so selecting presets and typing custom patterns
 * don't clobber each other. Regex matching is always on (a plain word is a
 * literal regex), so the Use-Regex toggle is omitted. Mode stays automatic since
 * policies run headless and manual redaction needs the canvas.
 */
export function PolicyRedactConfig({
  parameters,
  onChange,
  disabled,
}: PolicyRedactConfigProps) {
  const words = Array.isArray(parameters.wordsToRedact)
    ? (parameters.wordsToRedact as string[])
    : [];
  // Split the stored list: presets are driven by the dropdown, the rest by the
  // custom field below. Each editor only ever rewrites its own half.
  const presetWords = words.filter((w) => PRESET_PATTERNS.has(w));
  const customWords = words.filter((w) => !PRESET_PATTERNS.has(w));

  const redactColor =
    typeof parameters.redactColor === "string"
      ? parameters.redactColor
      : "#000000";
  const customPadding =
    typeof parameters.customPadding === "number"
      ? parameters.customPadding
      : 0.1;
  const wholeWordSearch = parameters.wholeWordSearch === true;
  const convertPDFToImage = parameters.convertPDFToImage !== false; // default on

  // Regex is always on for policies; heal any older/default-false value once on
  // mount (empty deps — we only need to normalise the persisted flag).
  useEffect(() => {
    if (parameters.useRegex !== true) {
      onChange({ ...parameters, useRegex: true });
    }
  }, []);

  // Every edit keeps mode automatic + regex on (the two policy invariants).
  const patch = (next: Record<string, unknown>) =>
    onChange({ ...parameters, mode: "automatic", useRegex: true, ...next });

  return (
    <Stack gap="md">
      <PolicyPiiField
        parameters={parameters}
        onChange={onChange}
        disabled={disabled}
      />

      <Divider />

      <WordsToRedactInput
        wordsToRedact={customWords}
        onWordsChange={(next) =>
          patch({ wordsToRedact: [...presetWords, ...next] })
        }
        disabled={disabled}
      />

      <Divider />

      <ColorInput
        label="Box colour"
        value={redactColor}
        onChange={(value) => patch({ redactColor: value })}
        disabled={disabled}
        size="sm"
        format="hex"
        popoverProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />

      <NumberInput
        label="Custom extra padding"
        value={customPadding}
        onChange={(value) =>
          patch({ customPadding: typeof value === "number" ? value : 0.1 })
        }
        min={0}
        max={10}
        step={0.1}
        disabled={disabled}
        size="sm"
        placeholder="0.1"
      />

      <Checkbox
        label="Whole word search"
        checked={wholeWordSearch}
        onChange={(e) => patch({ wholeWordSearch: e.currentTarget.checked })}
        disabled={disabled}
        size="sm"
      />

      <Checkbox
        label="Convert PDF to PDF-image (removes text behind the box)"
        checked={convertPDFToImage}
        onChange={(e) => patch({ convertPDFToImage: e.currentTarget.checked })}
        disabled={disabled}
        size="sm"
      />
    </Stack>
  );
}
