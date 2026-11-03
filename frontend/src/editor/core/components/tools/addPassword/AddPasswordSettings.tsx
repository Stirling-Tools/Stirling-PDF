import { Stack, PasswordInput, Select, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPasswordParameters } from "@editor/hooks/tools/addPassword/useAddPasswordParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";

interface AddPasswordSettingsProps {
  parameters: AddPasswordParameters;
  onParameterChange: <K extends keyof AddPasswordParameters>(
    key: K,
    value: AddPasswordParameters[K],
  ) => void;
  disabled?: boolean;
  showOwnerPassword?: boolean;
}

const AddPasswordSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  showOwnerPassword = true,
}: AddPasswordSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Stack gap="sm">
        <PasswordInput
          size="xs"
          label={
            showOwnerPassword
              ? t("encryptedPdfUnlock.openingPassword", "Password to open")
              : undefined
          }
          aria-label={t(
            "encryptedPdfUnlock.openingPassword",
            "Password to open",
          )}
          placeholder={t("encryptedPdfUnlock.enterPassword", "Enter password")}
          value={parameters.password}
          onChange={(e) => onParameterChange("password", e.target.value)}
          disabled={disabled}
        />
        {showOwnerPassword && (
          <PasswordInput
            size="xs"
            label={t(
              "encryptedPdfUnlock.newOwnerPassword",
              "New permissions password",
            )}
            placeholder={t(
              "encryptedPdfUnlock.chooseOwnerPassword",
              "Choose a different password",
            )}
            value={parameters.ownerPassword}
            onChange={(e) => onParameterChange("ownerPassword", e.target.value)}
            disabled={disabled}
          />
        )}
      </Stack>

      <details>
        <summary>
          <Text component="span" size="xs">
            {t("encryptedPdfUnlock.advanced", "Advanced")}
          </Text>
        </summary>
        <Select
          size="xs"
          label={t(
            "addPassword.encryption.keyLength.label",
            "Encryption Key Length",
          )}
          value={parameters.keyLength.toString()}
          onChange={(value) => {
            if (value) {
              onParameterChange("keyLength", parseInt(value));
            }
          }}
          disabled={disabled}
          data={[
            {
              value: "40",
              label: t(
                "addPassword.encryption.keyLength.40bit",
                "40-bit (Low)",
              ),
            },
            {
              value: "128",
              label: t(
                "addPassword.encryption.keyLength.128bit",
                "128-bit (Standard)",
              ),
            },
            {
              value: "256",
              label: t(
                "addPassword.encryption.keyLength.256bit",
                "256-bit (High)",
              ),
            },
          ]}
          comboboxProps={{
            withinPortal: true,
            zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
          }}
        />
      </details>
    </Stack>
  );
};

export default AddPasswordSettings;
