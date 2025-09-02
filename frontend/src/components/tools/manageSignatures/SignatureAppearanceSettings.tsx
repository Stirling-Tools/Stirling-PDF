import { Stack, Text, Button, TextInput, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ManageSignaturesParameters } from "../../../hooks/tools/manageSignatures/useManageSignaturesParameters";

interface SignatureAppearanceSettingsProps {
  parameters: ManageSignaturesParameters;
  onParameterChange: (key: keyof ManageSignaturesParameters, value: any) => void;
  disabled?: boolean;
}

const SignatureAppearanceSettings = ({ parameters, onParameterChange, disabled = false }: SignatureAppearanceSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {/* Signature Visibility */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>
          {t('manageSignatures.appearance.title', 'Signature Appearance')}
        </Text>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={!parameters.showSignature ? 'filled' : 'outline'}
            color={!parameters.showSignature ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('showSignature', false)}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              {t('manageSignatures.appearance.invisible', 'Invisible')}
            </div>
          </Button>
          <Button
            variant={parameters.showSignature ? 'filled' : 'outline'}
            color={parameters.showSignature ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('showSignature', true)}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              {t('manageSignatures.appearance.visible', 'Visible')}
            </div>
          </Button>
        </div>
      </Stack>

      {/* Visible Signature Options */}
      {parameters.showSignature && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            {t('manageSignatures.appearance.options.title', 'Signature Details')}
          </Text>
          <TextInput
            label={t('manageSignatures.signing.reason', 'Reason for Signing')}
            value={parameters.reason}
            onChange={(event) => onParameterChange('reason', event.currentTarget.value)}
            disabled={disabled}
          />
          <TextInput
            label={t('manageSignatures.signing.location', 'Location')}
            value={parameters.location}
            onChange={(event) => onParameterChange('location', event.currentTarget.value)}
            disabled={disabled}
          />
          <TextInput
            label={t('manageSignatures.signing.name', 'Signer Name')}
            value={parameters.name}
            onChange={(event) => onParameterChange('name', event.currentTarget.value)}
            disabled={disabled}
          />
          <NumberInput
            label={t('manageSignatures.signing.pageNumber', 'Page Number')}
            value={parameters.pageNumber}
            onChange={(value) => onParameterChange('pageNumber', value || 1)}
            min={1}
            disabled={disabled}
          />
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t('manageSignatures.signing.logoTitle', 'Logo')}
            </Text>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button
                variant={!parameters.showLogo ? 'filled' : 'outline'}
                color={!parameters.showLogo ? 'blue' : 'var(--text-muted)'}
                onClick={() => onParameterChange('showLogo', false)}
                disabled={disabled}
                style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
              >
                <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
                  {t('manageSignatures.signing.noLogo', 'No Logo')}
                </div>
              </Button>
              <Button
                variant={parameters.showLogo ? 'filled' : 'outline'}
                color={parameters.showLogo ? 'blue' : 'var(--text-muted)'}
                onClick={() => onParameterChange('showLogo', true)}
                disabled={disabled}
                style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
              >
                <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
                  {t('manageSignatures.signing.showLogo', 'Show Logo')}
                </div>
              </Button>
            </div>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
};

export default SignatureAppearanceSettings;