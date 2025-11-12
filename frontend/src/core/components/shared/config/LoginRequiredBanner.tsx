import { Alert, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';

interface LoginRequiredBannerProps {
  show: boolean;
}

/**
 * Banner component that displays when login mode is required but not enabled
 * Shows prominent warning that settings are read-only
 */
export default function LoginRequiredBanner({ show }: LoginRequiredBannerProps) {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <Alert
      icon={<LocalIcon icon="lock-rounded" width={20} height={20} />}
      title={t('admin.settings.loginDisabled.title', 'Login Mode Required')}
      color="blue"
      variant="light"
      styles={{
        root: {
          borderLeft: '4px solid var(--mantine-color-blue-6)'
        }
      }}
    >
      <Text size="sm">
        {t('admin.settings.loginDisabled.message', 'Login mode must be enabled to modify admin settings. Please set SECURITY_ENABLELOGIN=true in your environment or security.enableLogin: true in settings.yml, then restart the server.')}
      </Text>
      <Text size="sm" fw={600} mt="xs" c="dimmed">
        {t('admin.settings.loginDisabled.readOnly', 'The settings below show example values for reference. Enable login mode to view and edit actual configuration.')}
      </Text>
    </Alert>
  );
}
