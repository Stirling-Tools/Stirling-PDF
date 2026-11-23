import { useState } from "react";
import { Stack, TextInput, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import { Collapsible } from "@editor/ui/Collapsible";
import { ToggleSwitch } from "@editor/ui/ToggleSwitch";

interface SignatureAppearanceSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
}

const SignatureAppearanceSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: SignatureAppearanceSettingsProps) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(
    Boolean(parameters.reason || parameters.location || parameters.name),
  );

  return (
    <Stack gap="md">
      <ToggleSwitch
        checked={parameters.showSignature}
        onChange={(checked) => onParameterChange("showSignature", checked)}
        label={t("certSign.appearance.showOnPage", "Show signature on page")}
        disabled={disabled}
      />

      {parameters.showSignature && (
        <Stack gap="sm">
          <NumberInput
            label={t("certSign.pageNumber", "Page Number")}
            value={parameters.pageNumber}
            onChange={(value) =>
              onParameterChange(
                "pageNumber",
                typeof value === "number" ? value : 1,
              )
            }
            min={1}
            disabled={disabled}
          />
          <ToggleSwitch
            checked={parameters.showLogo}
            onChange={(checked) => onParameterChange("showLogo", checked)}
            label={t("certSign.showLogo", "Show Logo")}
            disabled={disabled}
          />
        </Stack>
      )}

      <Collapsible
        open={detailsOpen}
        onToggle={() => setDetailsOpen((open) => !open)}
        header={t(
          "certSign.appearance.options.optionalTitle",
          "Signature details (optional)",
        )}
      >
        <Stack gap="sm" inert={!detailsOpen}>
          <TextInput
            label={t("certSign.reason", "Reason")}
            value={parameters.reason}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("reason", event.currentTarget.value)
            }
            disabled={disabled}
          />
          <TextInput
            label={t("certSign.location", "Location")}
            value={parameters.location}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("location", event.currentTarget.value)
            }
            disabled={disabled}
          />
          <TextInput
            label={t("certSign.appearance.options.signerName", "Signer name")}
            placeholder={t(
              "certSign.appearance.options.signerNamePlaceholder",
              "Uses the name on the certificate",
            )}
            value={parameters.name}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("name", event.currentTarget.value)
            }
            disabled={disabled}
          />
        </Stack>
      </Collapsible>
    </Stack>
  );
};

export default SignatureAppearanceSettings;
