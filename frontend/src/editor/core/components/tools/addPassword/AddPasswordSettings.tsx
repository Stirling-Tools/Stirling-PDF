import { Stack, PasswordInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPasswordParameters } from "@editor/hooks/tools/addPassword/useAddPasswordParameters";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

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
          className={privateContentClassName}
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
            className={privateContentClassName}
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

      <ButtonSelector
        {...infoLabelProps(
          t("addPassword.encryption.keyLength.label", "Encryption Strength"),
          t(
            "addPassword.tooltip.encryption.text",
            "Higher encryption levels provide better security but may not be supported by older PDF viewers.",
          ),
        )}
        value={parameters.keyLength}
        onChange={(value) => onParameterChange("keyLength", value)}
        disabled={disabled}
        options={[
          {
            value: 40,
            label: t("addPassword.encryption.keyLength.40bit", "40-bit"),
          },
          {
            value: 128,
            label: t("addPassword.encryption.keyLength.128bit", "128-bit"),
          },
          {
            value: 256,
            label: t("addPassword.encryption.keyLength.256bit", "256-bit"),
          },
        ]}
      />
    </Stack>
  );
};

export default AddPasswordSettings;
