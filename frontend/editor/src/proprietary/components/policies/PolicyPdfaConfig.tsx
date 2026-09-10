import { useTranslation } from "react-i18next";
import { FormField, Select } from "@app/ui";
import {
  PDFA_OUTPUT_FORMATS,
  type PdfaOutputFormat,
  type PdfaPolicyParameters,
} from "@app/policies/pdfaOperation";
import "@app/components/policies/PolicySetupWizard.css";

/** Configures the PDF/A step: which archival profile to convert to. */
interface PolicyPdfaConfigProps {
  parameters: PdfaPolicyParameters;
  onChange: (parameters: PdfaPolicyParameters) => void;
}

export function PolicyPdfaConfig({
  parameters,
  onChange,
}: PolicyPdfaConfigProps) {
  const { t } = useTranslation();

  // Not `capability-config`: the wizard already wraps this in one, and repeating the class draws
  // its dashed divider twice.
  return (
    <div className="portal-policies__capability-settings">
      <FormField
        label={t("portal.policies.config.pdfa.fields.outputFormat.label")}
        helperText={t("portal.policies.config.pdfa.fields.outputFormat.help")}
      >
        <Select
          value={parameters.outputFormat}
          options={PDFA_OUTPUT_FORMATS.map((format) => ({
            value: format,
            label: t(`policyOption.${format}`, format),
          }))}
          onChange={(value) =>
            onChange({
              ...parameters,
              outputFormat: (value as PdfaOutputFormat) ?? "pdfa-2b",
            })
          }
        />
      </FormField>
    </div>
  );
}
