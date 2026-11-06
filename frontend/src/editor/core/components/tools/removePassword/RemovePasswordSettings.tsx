import { Stack, PasswordInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RemovePasswordParameters } from "@editor/hooks/tools/removePassword/useRemovePasswordParameters";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

interface RemovePasswordSettingsProps {
  parameters: RemovePasswordParameters;
  onParameterChange: <K extends keyof RemovePasswordParameters>(
    key: K,
    value: RemovePasswordParameters[K],
  ) => void;
  disabled?: boolean;
}

const RemovePasswordSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: RemovePasswordSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Stack gap="sm">
        <PasswordInput
          className={privateContentClassName}
          label={t("removePassword.password.label", "Current Password")}
          placeholder={t(
            "removePassword.password.placeholder",
            "Enter current password",
          )}
          value={parameters.password}
          onChange={(e) => onParameterChange("password", e.target.value)}
          disabled={disabled}
          required
        />
      </Stack>
    </Stack>
  );
};

export default RemovePasswordSettings;
