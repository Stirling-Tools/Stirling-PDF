import { Stack, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangePermissionsParameters } from "../../../hooks/tools/changePermissions/useChangePermissionsParameters";

interface ChangePermissionsSettingsProps {
  parameters: ChangePermissionsParameters;
  onParameterChange: <K extends keyof ChangePermissionsParameters>(key: K, value: ChangePermissionsParameters[K]) => void;
  disabled?: boolean;
}

const ChangePermissionsSettings = ({ parameters, onParameterChange, disabled = false }: ChangePermissionsSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Stack gap="xs">
        {(Object.keys(parameters) as Array<keyof ChangePermissionsParameters>).map((key) => (
          <Checkbox
            key={key}
            label={t(`changePermissions.permissions.${String(key)}.label`, { defaultValue: String(key) })}
            checked={parameters[key] as boolean}
            onChange={(e) => onParameterChange(key, e.target.checked)}
            disabled={disabled}
          />
        ))}
      </Stack>
    </Stack>
  );
};

export default ChangePermissionsSettings;
