import { Alert, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';

interface EnterpriseRequiredBannerProps {
  show: boolean;
  featureName: string;
}

/**
 * Banner that explains enterprise-only features are in demo mode
 */
export default function EnterpriseRequiredBanner({ show, featureName }: EnterpriseRequiredBannerProps) {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <Alert
      icon={<LocalIcon icon="workspace-premium-rounded" width={20} height={20} />}
      title={t('admin.settings.enterpriseRequired.title', 'Enterprise License Required')}
      color="yellow"
      variant="light"
      styles={{
        root: {
          borderLeft: '4px solid var(--mantine-color-yellow-6)'
        }
      }}
    >
      <Text size="sm">
        {t(
          'admin.settings.enterpriseRequired.message',
          'An Enterprise license is required to access {{featureName}}. You are viewing demo data for reference.',
          { featureName }
        )}
      </Text>
    </Alert>
  );
}
