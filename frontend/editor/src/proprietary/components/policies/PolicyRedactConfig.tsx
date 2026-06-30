import { useEffect } from "react";
import { PolicyPiiField } from "@app/components/policies/PolicyPiiField";

interface PolicyRedactConfigProps {
  parameters: Record<string, unknown>;
  onChange: (parameters: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Redact configuration for a policy — reduced to just the PII type picker. The
 * runtime params are fixed (mode automatic, regex on, flatten-to-image on so the
 * redacted text is truly removed) and normalised once on mount; the dropdown
 * only chooses which PII patterns are redacted.
 */
export function PolicyRedactConfig({
  parameters,
  onChange,
  disabled,
}: PolicyRedactConfigProps) {
  // Lock the non-PII params once on mount (empty deps); the dropdown manages the
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

  return (
    <PolicyPiiField
      parameters={parameters}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
