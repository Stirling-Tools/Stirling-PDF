import { Stack, Text, TextInput, NumberInput } from "@mantine/core";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { useTranslation } from "react-i18next";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
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
            {...infoLabelProps(
              t("certSign.reason", "Reason"),
              t(
                "certSign.reasonInfo",
                'Why you are signing, such as "Approval". Stored in the signature\'s details.',
              ),
            )}
            value={parameters.reason}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("reason", event.currentTarget.value)
            }
            disabled={disabled}
          />
          <TextInput
            {...infoLabelProps(
              t("certSign.location", "Location"),
              t(
                "certSign.locationInfo",
                'Where you signed, such as "London Office". Stored in the signature\'s details; it does not move the signature on the page.',
              ),
            )}
            value={parameters.location}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("location", event.currentTarget.value)
            }
            disabled={disabled}
          />
          <TextInput
            {...infoLabelProps(
              t("certSign.name", "Name"),
              t(
                "certSign.nameInfo",
                "Your name, stored in the signature's details. The visible signature shows the name on the certificate instead.",
              ),
            )}
            value={parameters.name}
            className={privateContentClassName}
            onChange={(event) =>
              onParameterChange("name", event.currentTarget.value)
            }
            disabled={disabled}
          />
          <NumberInput
            {...infoLabelProps(
              t("certSign.pageNumber", "Page Number"),
              t(
                "certSign.pageNumberInfo",
                "The page the visible signature is drawn on. The first page is 1.",
              ),
            )}
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
            {...infoLabelProps(
              t("certSign.logoTitle", "Logo"),
              t(
                "signatureSettings.tooltip.logo.description",
                "Add a company logo to visible signatures for branding and authenticity.",
              ),
            )}
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
