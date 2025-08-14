import { Stack, Text, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangePermissionsParameters } from "../../../hooks/tools/changePermissions/useChangePermissionsParameters";

interface ChangePermissionsSettingsProps {
  parameters: ChangePermissionsParameters;
  onParameterChange: (key: keyof ChangePermissionsParameters, value: boolean) => void;
  disabled?: boolean;
}

const ChangePermissionsSettings = ({ parameters, onParameterChange, disabled = false }: ChangePermissionsSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500}>{t('changePermissions.restrictions.title', 'Document Restrictions')}</Text>

      <Stack gap="xs">
        {(Object.keys(parameters) as Array<keyof ChangePermissionsParameters>).map((key) => (
          <Checkbox
            key={key}
            label={t(`changePermissions.restrictions.${key}.label`, key)}
            checked={parameters[key]}
            onChange={(e) => onParameterChange(key, e.target.checked)}
            disabled={disabled}
          />
        ))}
      </Stack>
    </Stack>
  );
};

export default ChangePermissionsSettings;
