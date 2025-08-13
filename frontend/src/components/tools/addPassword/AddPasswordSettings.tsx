import React from "react";
import { Stack, Text, PasswordInput, Select, Checkbox } from "@mantine/core";
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

      {/* Document Restrictions */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>{t('addPassword.restrictions.title', 'Document Restrictions')}</Text>

        <Stack gap="xs">
          <Checkbox
            label={t('addPassword.restrictions.assembly.label', 'Prevent document assembly')}
            checked={parameters.preventAssembly}
            onChange={(e) => onParameterChange('preventAssembly', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.extractContent.label', 'Prevent content extraction')}
            checked={parameters.preventExtractContent}
            onChange={(e) => onParameterChange('preventExtractContent', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.extractForAccessibility.label', 'Prevent accessibility extraction')}
            checked={parameters.preventExtractForAccessibility}
            onChange={(e) => onParameterChange('preventExtractForAccessibility', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.fillInForm.label', 'Prevent form filling')}
            checked={parameters.preventFillInForm}
            onChange={(e) => onParameterChange('preventFillInForm', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.modify.label', 'Prevent document modification')}
            checked={parameters.preventModify}
            onChange={(e) => onParameterChange('preventModify', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.modifyAnnotations.label', 'Prevent annotation modification')}
            checked={parameters.preventModifyAnnotations}
            onChange={(e) => onParameterChange('preventModifyAnnotations', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.printing.label', 'Prevent printing')}
            checked={parameters.preventPrinting}
            onChange={(e) => onParameterChange('preventPrinting', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.printingFaithful.label', 'Prevent high-quality printing')}
            checked={parameters.preventPrintingFaithful}
            onChange={(e) => onParameterChange('preventPrintingFaithful', e.target.checked)}
            disabled={disabled}
          />
        </Stack>
      </Stack>
    </Stack>
  );
};

export default AddPasswordSettings;
