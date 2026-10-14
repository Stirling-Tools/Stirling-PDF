import { Stack, PasswordInput, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPasswordParameters } from "@app/hooks/tools/addPassword/useAddPasswordParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

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
          label={t(
            "encryptedPdfUnlock.newOpeningPassword",
            "New password to open",
          )}
          placeholder={t(
            "encryptedPdfUnlock.chooseOpeningPassword",
            "Choose a password to open the PDF",
          )}
          value={parameters.password}
          onChange={(e) => onParameterChange("password", e.target.value)}
          disabled={disabled}
        />
        {showOwnerPassword && (
          <PasswordInput
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
        <summary>{t("encryptedPdfUnlock.advanced", "Advanced")}</summary>
        <Select
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
