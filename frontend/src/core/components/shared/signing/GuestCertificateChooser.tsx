import { Alert, FileInput, PasswordInput, Radio, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export type GuestCertType = 'GUEST_CERT' | 'P12';

interface GuestCertificateChooserProps {
  value: GuestCertType;
  onChange: (certType: GuestCertType) => void;
  onFileChange: (file: File | null) => void;
  onPasswordChange: (password: string) => void;
  p12File: File | null;
  password: string;
}

export const GuestCertificateChooser: React.FC<GuestCertificateChooserProps> = ({
  value,
  onChange,
  onFileChange,
  onPasswordChange,
  p12File,
  password,
}) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Text fw={500} size="sm">
        {t('guestSigning.certSectionTitle', 'Signing Certificate')}
      </Text>

      <Radio.Group
        value={value}
        onChange={(val) => {
          onChange(val as GuestCertType);
          // Clear uploaded file when switching back to auto
          if (val === 'GUEST_CERT') {
            onFileChange(null);
            onPasswordChange('');
          }
        }}
      >
        <Stack gap="xs">
          <Radio
            value="GUEST_CERT"
            label={t('guestSigning.certChoiceAuto', 'Use auto-generated certificate (recommended)')}
          />
          <Radio
            value="P12"
            label={t('guestSigning.certChoiceUpload', 'Upload my own certificate')}
          />
        </Stack>
      </Radio.Group>

      {value === 'GUEST_CERT' && (
        <Alert color="blue" variant="light">
          {t(
            'guestSigning.certAutoNote',
            'A certificate will be generated using your email address for traceability.'
          )}
        </Alert>
      )}

      {value === 'P12' && (
        <Stack gap="xs">
          <FileInput
            label={t('guestSigning.certFileLabel', 'Certificate file (.p12 / .pfx)')}
            placeholder={t('guestSigning.certFilePlaceholder', 'Select .p12 or .pfx file')}
            accept=".p12,.pfx"
            value={p12File}
            onChange={onFileChange}
          />
          <PasswordInput
            label={t('guestSigning.certPasswordLabel', 'Certificate password')}
            placeholder={t('guestSigning.certPasswordPlaceholder', 'Enter certificate password')}
            value={password}
            onChange={(e) => onPasswordChange(e.currentTarget.value)}
          />
        </Stack>
      )}
    </Stack>
  );
};
