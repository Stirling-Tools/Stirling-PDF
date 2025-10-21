import { Stack, PasswordInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RemovePasswordParameters } from "@app/hooks/tools/removePassword/useRemovePasswordParameters";

interface RemovePasswordSettingsProps {
  parameters: RemovePasswordParameters;
  onParameterChange: <K extends keyof RemovePasswordParameters>(key: K, value: RemovePasswordParameters[K]) => void;
  disabled?: boolean;
}

const RemovePasswordSettings = ({ parameters, onParameterChange, disabled = false }: RemovePasswordSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Stack gap="sm">
        <PasswordInput
          label={t('removePassword.password.label', 'Current Password')}
          placeholder={t('removePassword.password.placeholder', 'Enter current password')}
          value={parameters.password}
          onChange={(e) => onParameterChange('password', e.target.value)}
          disabled={disabled}
          required
        />
      </Stack>
    </Stack>
  );
};

export default RemovePasswordSettings;
