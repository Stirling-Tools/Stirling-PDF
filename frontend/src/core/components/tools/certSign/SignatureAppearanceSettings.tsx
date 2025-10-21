import { Stack, Text, Button, TextInput, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";

interface SignatureAppearanceSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

const SignatureAppearanceSettings = ({ parameters, onParameterChange, disabled = false }: SignatureAppearanceSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {/* Signature Visibility */}
      <Stack gap="sm">
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={!parameters.showSignature ? 'filled' : 'outline'}
            color={!parameters.showSignature ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('showSignature', false)}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              {t('certSign.appearance.invisible', 'Invisible')}
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
              {t('certSign.appearance.visible', 'Visible')}
            </div>
          </Button>
        </div>
      </Stack>

      {/* Visible Signature Options */}
      {parameters.showSignature && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            {t('certSign.appearance.options.title', 'Signature Details')}
          </Text>
          <TextInput
            label={t('certSign.reason', 'Reason')}
            value={parameters.reason}
            onChange={(event) => onParameterChange('reason', event.currentTarget.value)}
            disabled={disabled}
          />
          <TextInput
            label={t('certSign.location', 'Location')}
            value={parameters.location}
            onChange={(event) => onParameterChange('location', event.currentTarget.value)}
            disabled={disabled}
          />
          <TextInput
            label={t('certSign.name', 'Name')}
            value={parameters.name}
            onChange={(event) => onParameterChange('name', event.currentTarget.value)}
            disabled={disabled}
          />
          <NumberInput
            label={t('certSign.pageNumber', 'Page Number')}
            value={parameters.pageNumber}
            onChange={(value) => onParameterChange('pageNumber', value || 1)}
            min={1}
            disabled={disabled}
          />
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t('certSign.logoTitle', 'Logo')}
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
                  {t('certSign.noLogo', 'No Logo')}
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
                  {t('certSign.showLogo', 'Show Logo')}
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