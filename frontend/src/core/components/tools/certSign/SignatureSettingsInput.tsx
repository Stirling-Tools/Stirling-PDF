import { Stack, Text, Button, TextInput, NumberInput, Switch } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export interface SignatureSettings {
  showSignature?: boolean;
  pageNumber?: number;
  reason?: string;
  location?: string;
  showLogo?: boolean;
}

interface SignatureSettingsInputProps {
  value: SignatureSettings;
  onChange: (settings: SignatureSettings) => void;
  disabled?: boolean;
}

const SignatureSettingsInput = ({ value, onChange, disabled = false }: SignatureSettingsInputProps) => {
  const { t } = useTranslation();

  const handleChange = (key: keyof SignatureSettings, val: any) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        {t('certSign.collab.signatureSettings.title', 'Signature Appearance')}
      </Text>
      <Text size="xs" c="dimmed">
        {t('certSign.collab.signatureSettings.description', 'Configure how signatures will appear for all participants')}
      </Text>

      {/* Signature Visibility */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <Button
          variant={!value.showSignature ? 'filled' : 'outline'}
          color={!value.showSignature ? 'blue' : 'var(--text-muted)'}
          onClick={() => handleChange('showSignature', false)}
          disabled={disabled}
          style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
            {t('certSign.appearance.invisible', 'Invisible')}
          </div>
        </Button>
        <Button
          variant={value.showSignature ? 'filled' : 'outline'}
          color={value.showSignature ? 'blue' : 'var(--text-muted)'}
          onClick={() => handleChange('showSignature', true)}
          disabled={disabled}
          style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
            {t('certSign.appearance.visible', 'Visible')}
          </div>
        </Button>
      </div>

      {/* Visible Signature Options */}
      {value.showSignature && (
        <Stack gap="sm">
          <TextInput
            label={t('certSign.reason', 'Reason')}
            value={value.reason || ''}
            onChange={(event) => handleChange('reason', event.currentTarget.value)}
            disabled={disabled}
            size="xs"
          />
          <TextInput
            label={t('certSign.location', 'Location')}
            value={value.location || ''}
            onChange={(event) => handleChange('location', event.currentTarget.value)}
            disabled={disabled}
            size="xs"
          />
          <NumberInput
            label={t('certSign.pageNumber', 'Page Number')}
            value={value.pageNumber || 1}
            onChange={(val) => handleChange('pageNumber', val || 1)}
            min={1}
            disabled={disabled}
            size="xs"
          />
          <Switch
            label={t('certSign.showLogo', 'Show Stirling PDF Logo')}
            checked={value.showLogo || false}
            onChange={(event) => handleChange('showLogo', event.currentTarget.checked)}
            disabled={disabled}
            size="sm"
          />
        </Stack>
      )}
    </Stack>
  );
};

export default SignatureSettingsInput;
