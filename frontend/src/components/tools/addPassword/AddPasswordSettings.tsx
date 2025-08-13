import React from "react";
import { Stack, Text, PasswordInput, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPasswordParameters } from "../../../hooks/tools/addPassword/useAddPasswordParameters";

interface AddPasswordSettingsProps {
  parameters: AddPasswordParameters;
  onParameterChange: (key: keyof AddPasswordParameters, value: any) => void;
  disabled?: boolean;
}

const AddPasswordSettings = ({ parameters, onParameterChange, disabled = false }: AddPasswordSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {/* Password Settings */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>{t('addPassword.passwords.title', 'Passwords')}</Text>
        <PasswordInput
          label={t('addPassword.passwords.user.label', 'User Password')}
          placeholder={t('addPassword.passwords.user.placeholder', 'Enter user password')}
          value={parameters.password}
          onChange={(e) => onParameterChange('password', e.target.value)}
          disabled={disabled}
        />
        <PasswordInput
          label={t('addPassword.passwords.owner.label', 'Owner Password')}
          placeholder={t('addPassword.passwords.owner.placeholder', 'Enter owner password')}
          value={parameters.ownerPassword}
          onChange={(e) => onParameterChange('ownerPassword', e.target.value)}
          disabled={disabled}
        />
      </Stack>

      {/* Encryption Settings */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>{t('addPassword.encryption.title', 'Encryption')}</Text>
        <Select
          label={t('addPassword.encryption.keyLength.label', 'Key Length')}
          value={parameters.keyLength.toString()}
          onChange={(value) => {
            if (value) {
              onParameterChange('keyLength', parseInt(value));
            }
          }}
          disabled={disabled}
          data={[
            { value: '40', label: t('addPassword.encryption.keyLength.40bit', '40-bit (Low)') },
            { value: '128', label: t('addPassword.encryption.keyLength.128bit', '128-bit (Standard)') },
            { value: '256', label: t('addPassword.encryption.keyLength.256bit', '256-bit (High)') }
          ]}
        />
      </Stack>

    </Stack>
  );
};

export default AddPasswordSettings;
