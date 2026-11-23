import { Stack, Text, TextInput, NumberInput } from "@mantine/core";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

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

  return (
    <Stack gap="md">
      <ButtonSelector
        ariaLabel={t("certSign.appearance.visibility", "Visibility")}
        value={parameters.showSignature ? "visible" : "invisible"}
        onChange={(next) =>
          onParameterChange("showSignature", next === "visible")
        }
        options={[
          {
            value: "invisible",
            label: t("certSign.appearance.invisible", "Invisible"),
          },
          {
            value: "visible",
            label: t("certSign.appearance.visible", "Visible"),
          },
        ]}
        disabled={disabled}
      />

      {/* Visible Signature Options */}
      {parameters.showSignature && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            {t("certSign.appearance.options.title", "Signature Details")}
          </Text>
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
            label={t("certSign.name", "Name")}
            value={parameters.name}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("name", event.currentTarget.value)
            }
            disabled={disabled}
          />
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
          <ButtonSelector
            label={t("certSign.logoTitle", "Logo")}
            value={parameters.showLogo ? "show" : "none"}
            onChange={(next) => onParameterChange("showLogo", next === "show")}
            options={[
              { value: "none", label: t("certSign.noLogo", "No Logo") },
              { value: "show", label: t("certSign.showLogo", "Show Logo") },
            ]}
            disabled={disabled}
          />
        </Stack>
      )}
    </Stack>
  );
};

export default SignatureAppearanceSettings;
