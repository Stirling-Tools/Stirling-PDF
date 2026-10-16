import {
  Stack,
  Text,
  TextInput,
  NumberInput,
  Switch,
  Group,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/ui/Tooltip";
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

      <div style={{ display: "flex", gap: "4px" }}>
        <Button
          accent={!value.showSignature ? "default" : "neutral"}
          variant={!value.showSignature ? "primary" : "secondary"}
          onClick={() => handleChange("showSignature", false)}
          disabled={disabled}
          style={{
            flex: 1,
            height: "auto",
            minHeight: "40px",
            fontSize: "11px",
          }}
        >
          <div
            style={{ textAlign: "center", lineHeight: "1.1", fontSize: "11px" }}
          >
            {t("certSign.appearance.invisible", "Invisible")}
          </div>
        </Button>
        <Button
          accent={value.showSignature ? "default" : "neutral"}
          variant={value.showSignature ? "primary" : "secondary"}
          onClick={() => handleChange("showSignature", true)}
          disabled={disabled}
          style={{
            flex: 1,
            height: "auto",
            minHeight: "40px",
            fontSize: "11px",
          }}
        >
          <div
            style={{ textAlign: "center", lineHeight: "1.1", fontSize: "11px" }}
          >
            {t("certSign.appearance.visible", "Visible")}
          </div>
        </Button>
      </div>

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
