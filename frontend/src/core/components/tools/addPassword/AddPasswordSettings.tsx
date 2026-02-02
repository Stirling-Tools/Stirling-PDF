import { Stack, PasswordInput, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPasswordParameters } from "@app/hooks/tools/addPassword/useAddPasswordParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface AddPasswordSettingsProps {
  parameters: AddPasswordParameters;
  onParameterChange: <K extends keyof AddPasswordParameters>(key: K, value: AddPasswordParameters[K]) => void;
  disabled?: boolean;
}

const AddPasswordSettings = ({ parameters, onParameterChange, disabled = false }: AddPasswordSettingsProps) => {
  const { t } = useTranslation();

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <Stack gap="md">
        {/* Password Settings */}
        <Stack gap="sm">
          <PasswordInput
            label={t("addPassword.passwords.user.label", "User Password")}
            placeholder={t("addPassword.passwords.user.placeholder", "Enter user password")}
            value={parameters.password}
            onChange={(e) => onParameterChange("password", e.target.value)}
            disabled={disabled}
          />
          <PasswordInput
            label={t("addPassword.passwords.owner.label", "Owner Password")}
            placeholder={t("addPassword.passwords.owner.placeholder", "Enter owner password")}
            value={parameters.ownerPassword}
            onChange={(e) => onParameterChange("ownerPassword", e.target.value)}
            disabled={disabled}
          />
        </Stack>

        {/* Encryption Settings */}
        <Stack gap="sm">
          <Select
            label={t("addPassword.encryption.keyLength.label", "Encryption Key Length")}
            value={parameters.keyLength.toString()}
            onChange={(value) => {
              if (value) {
                onParameterChange("keyLength", parseInt(value));
              }
            }}
            disabled={disabled}
            data={[
              { value: "40", label: t("addPassword.encryption.keyLength.40bit", "40-bit (Low)") },
              { value: "128", label: t("addPassword.encryption.keyLength.128bit", "128-bit (Standard)") },
              { value: "256", label: t("addPassword.encryption.keyLength.256bit", "256-bit (High)") },
            ]}
            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
          />
        </Stack>
      </Stack>
    </form>
  );
};

export default AddPasswordSettings;
