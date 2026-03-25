import { Button, Stack, Text, Group, Paper } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SignatureSettingsInput, { SignatureSettings } from '@app/components/tools/certSign/SignatureSettingsInput';

interface ConfigureSignatureDefaultsStepProps {
  settings: SignatureSettings;
  onSettingsChange: (settings: SignatureSettings) => void;
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export const ConfigureSignatureDefaultsStep: React.FC<ConfigureSignatureDefaultsStepProps> = ({
  settings,
  onSettingsChange,
  onBack,
  onNext,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <SignatureSettingsInput
        value={settings}
        onChange={onSettingsChange}
        disabled={disabled}
      />

      <Paper p="sm" withBorder>
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed">
            {t('groupSigning.steps.configureDefaults.preview', 'Preview')}
          </Text>
          <Text size="xs">
            {settings.showSignature
              ? t(
                  'groupSigning.steps.configureDefaults.visible',
                  'Signatures will be visible on page {{page}}',
                  { page: settings.pageNumber || 1 }
                )
              : t(
                  'groupSigning.steps.configureDefaults.invisible',
                  'Signatures will be invisible (metadata only)'
                )}
          </Text>
          {settings.showSignature && settings.reason && (
            <Text size="xs">
              <strong>{t('groupSigning.steps.configureDefaults.reasonLabel', 'Reason:')}</strong>{' '}
              {settings.reason}
            </Text>
          )}
          {settings.showSignature && settings.location && (
            <Text size="xs">
              <strong>
                {t('groupSigning.steps.configureDefaults.locationLabel', 'Location:')}
              </strong>{' '}
              {settings.location}
            </Text>
          )}
        </Stack>
      </Paper>

      <Group gap="sm">
        <Button variant="default" onClick={onBack} leftSection={<ArrowBackIcon sx={{ fontSize: 16 }} />}>
          {t('groupSigning.steps.back', 'Back')}
        </Button>
        <Button onClick={onNext} disabled={disabled} style={{ flex: 1 }}>
          {t('groupSigning.steps.configureDefaults.continue', 'Continue to Review')}
        </Button>
      </Group>
    </Stack>
  );
};
