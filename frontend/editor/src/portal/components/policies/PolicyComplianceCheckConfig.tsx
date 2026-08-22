import { useTranslation } from "react-i18next";
import { FormField, Select } from "@app/ui";
import {
  COMPLIANCE_STANDARDS,
  COMPLIANCE_VIOLATION_ACTIONS,
  complianceCheckDefaultParameters,
  type ComplianceCheckParameters,
} from "@app/policies/operations";
import "@portal/views/Policies.css";

/**
 * Configures the compliance gate: which standard the finished document is judged against, and
 * whether failing it stops the run or is only recorded.
 */
interface PolicyComplianceCheckConfigProps {
  parameters: ComplianceCheckParameters;
  onChange: (parameters: ComplianceCheckParameters) => void;
}

export function PolicyComplianceCheckConfig({
  parameters,
  onChange,
}: PolicyComplianceCheckConfigProps) {
  const { t } = useTranslation();

  // Not `capability-config`: the wizard already wraps this in one, and repeating the class draws
  // its dashed divider twice.
  return (
    <div className="portal-policies__capability-settings">
      <FormField
        label={t(
          "portal.policies.config.complianceCheck.fields.standard.label",
        )}
        helperText={t(
          "portal.policies.config.complianceCheck.fields.standard.help",
        )}
      >
        <Select
          value={parameters.standard}
          options={COMPLIANCE_STANDARDS.map((standard) => ({
            value: standard,
            label: t(`policyOption.${standard}`, standard),
          }))}
          onChange={(value) =>
            onChange({
              ...parameters,
              standard:
                (value as ComplianceCheckParameters["standard"]) ??
                complianceCheckDefaultParameters.standard,
            })
          }
        />
      </FormField>

      <FormField
        label={t(
          "portal.policies.config.complianceCheck.fields.onViolation.label",
        )}
        helperText={t(
          "portal.policies.config.complianceCheck.fields.onViolation.help",
        )}
      >
        <Select
          value={parameters.onViolation}
          options={COMPLIANCE_VIOLATION_ACTIONS.map((action) => ({
            value: action,
            label: t(`policyOption.${action}`, action),
          }))}
          onChange={(value) =>
            onChange({
              ...parameters,
              onViolation:
                (value as ComplianceCheckParameters["onViolation"]) ??
                complianceCheckDefaultParameters.onViolation,
            })
          }
        />
      </FormField>
    </div>
  );
}
