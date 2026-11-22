import {
  Stack,
  Text,
  TextInput,
  NumberInput,
  Switch,
  Group,
} from "@mantine/core";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { Tooltip } from "@editor/ui/Tooltip";
import { useTranslation } from "react-i18next";

export interface SignatureSettings {
  showSignature?: boolean;
  pageNumber?: number;
  reason?: string;
  location?: string;
  showLogo?: boolean;
  includeSummaryPage?: boolean;
}

interface SignatureSettingsInputProps {
  value: SignatureSettings;
  onChange: (settings: SignatureSettings) => void;
  disabled?: boolean;
}

const SignatureSettingsInput = ({
  value,
  onChange,
  disabled = false,
}: SignatureSettingsInputProps) => {
  const { t } = useTranslation();

  const handleChange = <K extends keyof SignatureSettings>(
    key: K,
    val: SignatureSettings[K],
  ) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Text size="sm" fw={600}>
          {t("certSign.collab.signatureSettings.title", "Signature Appearance")}
        </Text>
        <Tooltip
          content={t(
            "certSign.collab.signatureSettings.description",
            "Configure how signatures will appear for all participants",
          )}
        >
          <ActionIcon
            variant="quiet"
            aria-label={t(
              "certSign.collab.signatureSettings.title",
              "Signature Appearance",
            )}
          >
            <Icon name="info" size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <ButtonSelector
        value={value.showSignature ? "visible" : "invisible"}
        onChange={(next) => handleChange("showSignature", next === "visible")}
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

      {value.showSignature && (
        <Stack gap="sm">
          <TextInput
            label={t("certSign.reason", "Reason")}
            value={value.reason || ""}
            onChange={(event) =>
              handleChange("reason", event.currentTarget.value)
            }
            disabled={disabled}
            size="xs"
          />
          <TextInput
            label={t("certSign.location", "Location")}
            value={value.location || ""}
            onChange={(event) =>
              handleChange("location", event.currentTarget.value)
            }
            disabled={disabled}
            size="xs"
          />
          <NumberInput
            label={t("certSign.pageNumber", "Page Number")}
            value={value.pageNumber || 1}
            onChange={(val) =>
              handleChange("pageNumber", typeof val === "number" ? val : 1)
            }
            min={1}
            disabled={disabled}
            size="xs"
          />
          <Switch
            label={t("certSign.showLogo", "Show Stirling PDF Logo")}
            checked={value.showLogo || false}
            onChange={(event) =>
              handleChange("showLogo", event.currentTarget.checked)
            }
            disabled={disabled}
            size="sm"
          />
        </Stack>
      )}

      <Group gap="xs" wrap="nowrap" align="center">
        <Switch
          label={t(
            "certSign.collab.sessionCreation.includeSummaryPage",
            "Include Signature Summary Page",
          )}
          checked={value.includeSummaryPage || false}
          onChange={(event) =>
            handleChange("includeSummaryPage", event.currentTarget.checked)
          }
          disabled={disabled}
          size="sm"
        />
        <Tooltip
          content={t(
            "certSign.collab.sessionCreation.includeSummaryPageHelp",
            "A summary page will be added at the end with all signature metadata. The digital certificate signature boxes on individual pages will be suppressed (wet signatures are unaffected).",
          )}
        >
          <ActionIcon
            variant="quiet"
            aria-label={t(
              "certSign.collab.sessionCreation.includeSummaryPage",
              "Include Signature Summary Page",
            )}
          >
            <Icon name="info" size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Stack>
  );
};

export default SignatureSettingsInput;
