import { useTranslation } from "react-i18next";
import { FormField, Select, ToggleSwitch } from "@app/ui";
import { SettingsRow } from "@app/ui/SettingsRow";
import {
  PDFUA_FIGURE_POLICIES,
  type PdfUaFigurePolicy,
  type PdfUaPolicyParameters,
} from "@app/policies/pdfUaOperation";
import "@portal/views/Policies.css";

/**
 * Configures the PDF/UA step: how undescribed images are treated (a policy cannot supply per-figure
 * alt text, so it decides between marking them decorative or failing), and whether fonts are embedded.
 */
interface PolicyPdfUaConfigProps {
  parameters: PdfUaPolicyParameters;
  onChange: (parameters: PdfUaPolicyParameters) => void;
}

export function PolicyPdfUaConfig({
  parameters,
  onChange,
}: PolicyPdfUaConfigProps) {
  const { t } = useTranslation();

  // Not `capability-config`: the wizard already wraps this in one, and repeating the class draws
  // its dashed divider twice.
  return (
    <div className="portal-policies__capability-settings">
      <FormField
        label={t("portal.policies.config.pdfUa.fields.figurePolicy.label")}
        helperText={t("portal.policies.config.pdfUa.fields.figurePolicy.help")}
      >
        <Select
          value={parameters.figurePolicy}
          options={PDFUA_FIGURE_POLICIES.map((policy) => ({
            value: policy,
            label: t(`policyOption.${policy}`, policy),
          }))}
          onChange={(value) =>
            onChange({
              ...parameters,
              figurePolicy: (value as PdfUaFigurePolicy) ?? "mark-decorative",
            })
          }
        />
      </FormField>

      <SettingsRow
        label={t("portal.policies.config.pdfUa.fields.embedFonts.label")}
        description={t("portal.policies.config.pdfUa.fields.embedFonts.help")}
        control={
          <ToggleSwitch
            size="sm"
            checked={parameters.embedFonts}
            onChange={(checked) =>
              onChange({ ...parameters, embedFonts: checked })
            }
            aria-label={t(
              "portal.policies.config.pdfUa.fields.embedFonts.label",
            )}
          />
        }
      />
    </div>
  );
}
