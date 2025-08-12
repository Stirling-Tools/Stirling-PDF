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
          description={t('addPassword.passwords.user.description', 'Password required to open the document')}
          placeholder={t('addPassword.passwords.user.placeholder', 'Enter user password')}
          value={parameters.password}
          onChange={(e) => onParameterChange('password', e.target.value)}
          disabled={disabled}
        />
        <PasswordInput
          label={t('addPassword.passwords.owner.label', 'Owner Password')}
          description={t('addPassword.passwords.owner.description', 'Password required to modify document permissions')}
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
          description={t('addPassword.encryption.keyLength.description', 'Higher values provide better security')}
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
        <Text size="xs" c="dimmed">
          {t('addPassword.restrictions.description', 'Select which actions should be prevented on the document')}
        </Text>

        <Stack gap="xs">
          <Checkbox
            label={t('addPassword.restrictions.assembly.label', 'Prevent document assembly')}
            description={t('addPassword.restrictions.assembly.description', 'Prevent inserting, rotating, or deleting pages and creating bookmarks or thumbnail images')}
            checked={parameters.preventAssembly}
            onChange={(e) => onParameterChange('preventAssembly', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.extractContent.label', 'Prevent content extraction')}
            description={t('addPassword.restrictions.extractContent.description', 'Prevent text and graphic extraction')}
            checked={parameters.preventExtractContent}
            onChange={(e) => onParameterChange('preventExtractContent', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.extractForAccessibility.label', 'Prevent accessibility extraction')}
            description={t('addPassword.restrictions.extractForAccessibility.description', 'Prevent content extraction for accessibility purposes')}
            checked={parameters.preventExtractForAccessibility}
            onChange={(e) => onParameterChange('preventExtractForAccessibility', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.fillInForm.label', 'Prevent form filling')}
            description={t('addPassword.restrictions.fillInForm.description', 'Prevent filling in existing interactive form fields')}
            checked={parameters.preventFillInForm}
            onChange={(e) => onParameterChange('preventFillInForm', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.modify.label', 'Prevent document modification')}
            description={t('addPassword.restrictions.modify.description', 'Prevent changing the document content')}
            checked={parameters.preventModify}
            onChange={(e) => onParameterChange('preventModify', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.modifyAnnotations.label', 'Prevent annotation modification')}
            description={t('addPassword.restrictions.modifyAnnotations.description', 'Prevent creation and modification of annotations and form fields')}
            checked={parameters.preventModifyAnnotations}
            onChange={(e) => onParameterChange('preventModifyAnnotations', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.printing.label', 'Prevent printing')}
            description={t('addPassword.restrictions.printing.description', 'Prevent printing the document')}
            checked={parameters.preventPrinting}
            onChange={(e) => onParameterChange('preventPrinting', e.target.checked)}
            disabled={disabled}
          />

          <Checkbox
            label={t('addPassword.restrictions.printingFaithful.label', 'Prevent high-quality printing')}
            description={t('addPassword.restrictions.printingFaithful.description', 'Prevent high-resolution printing')}
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
