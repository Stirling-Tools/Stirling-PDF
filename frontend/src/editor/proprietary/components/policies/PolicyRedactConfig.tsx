import { useEffect } from "react";
import { RedactPresetSelect } from "@editor/components/tools/redact/RedactPresetSelect";
import { selectedPresetIds } from "@editor/components/tools/redact/redactWords";
import {
  presetIdOfPattern,
  presetPatterns,
  type RedactPresetId,
} from "@editor/data/redactPresets";
import type { RedactParameters } from "@editor/hooks/tools/redact/useRedactParameters";

interface PolicyRedactConfigProps {
  parameters: RedactParameters;
  onChange: (parameters: RedactParameters) => void;
  disabled?: boolean;
}

/**
 * Redact configuration for a policy — reduced to just the PII type picker. The
 * runtime params are fixed (mode automatic, regex on, flatten-to-image on so the
 * redacted text is truly removed) and normalised once on mount; the picker
 * only chooses which PII patterns are redacted.
 */
export function PolicyRedactConfig({
  parameters,
  onChange,
  disabled,
}: PolicyRedactConfigProps) {
  // Lock the non-PII params once on mount (empty deps); the picker manages the
  // pattern list and preserves these via its spread.
  useEffect(() => {
    if (
      parameters.mode !== "automatic" ||
      parameters.useRegex !== true ||
      parameters.convertPDFToImage !== true
    ) {
      onChange({
        ...parameters,
        mode: "automatic",
        useRegex: true,
        convertPDFToImage: true,
      });
    }
  }, []);

  // Custom entries stay as stored: they are already regexes, since a policy
  // always runs with Use Regex on.
  const handleChange = (ids: RedactPresetId[]) => {
    onChange({
      ...parameters,
      mode: "automatic",
      useRegex: true,
      wordsToRedact: [
        ...presetPatterns(ids),
        ...parameters.wordsToRedact.filter(
          (w) => presetIdOfPattern(w) === undefined,
        ),
      ],
    });
  };

  return (
    <RedactPresetSelect
      value={selectedPresetIds(parameters)}
      onChange={handleChange}
      disabled={disabled}
    />
  );
}
