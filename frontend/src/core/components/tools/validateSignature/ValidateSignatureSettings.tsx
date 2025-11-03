import { Card, Group, Stack, Text, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import FileUploadButton from '@app/components/shared/FileUploadButton';
import { ValidateSignatureParameters } from '@app/hooks/tools/validateSignature/useValidateSignatureParameters';

interface ValidateSignatureSettingsProps {
  parameters: ValidateSignatureParameters;
  onParameterChange: <K extends keyof ValidateSignatureParameters>(parameter: K, value: ValidateSignatureParameters[K]) => void;
  disabled?: boolean;
}

const ValidateSignatureSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ValidateSignatureSettingsProps) => {
  const { t } = useTranslation();
  const certFile = parameters.certFile;

  const handleCertFileChange = (file: File | null) => {
    onParameterChange('certFile', file);
  };

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <div>
          <Text fw={600}>{t('validateSignature.selectCustomCert', 'Custom Certificate File X.509 (Optional)')}</Text>
          <Text size="sm" c="dimmed">
            {t(
              'validateSignature.settings.certHint',
              'Upload a trusted X.509 certificate to validate against a custom trust source.'
            )}
          </Text>
        </div>

        <Group align="center" gap="sm">
          <FileUploadButton
            file={certFile ?? undefined}
            onChange={handleCertFileChange}
            accept=".cer,.crt,.pem,.der"
            disabled={disabled}
            variant="filled"
          />
          {certFile && (
            <Button
              variant="subtle"
              color="gray"
              onClick={() => handleCertFileChange(null)}
              disabled={disabled}
            >
              {t('sign.clear', 'Clear')}
            </Button>
          )}
        </Group>

        {certFile && (
          <Text size="xs" c="dimmed">
            {t('size', 'Size')}: {Math.round(certFile.size / 1024)} KB
          </Text>
        )}
      </Stack>
    </Card>
  );
};

export default ValidateSignatureSettings;
