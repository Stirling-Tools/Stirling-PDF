import React from 'react';
import { Stack, Text, Code, Group, Badge, Alert, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { OverviewHeader } from '@app/components/shared/config/OverviewHeader';

const Overview: React.FC = () => {
  const { t } = useTranslation();
  const { config, loading, error } = useAppConfig();

  const renderConfigSection = (title: string, data: any) => {
    if (!data || typeof data !== 'object') return null;

    return (
      <Stack gap="xs" mb="md">
        <Text fw={600} size="md" c="blue">{title}</Text>
        <Stack gap="xs" pl="md">
          {Object.entries(data).map(([key, value]) => (
            <Group key={key} wrap="nowrap" align="flex-start">
              <Text size="sm" w={150} style={{ flexShrink: 0 }} c="dimmed">
                {key}:
              </Text>
              {typeof value === 'boolean' ? (
                <Badge color={value ? 'green' : 'red'} size="sm">
                  {value ? 'true' : 'false'}
                </Badge>
              ) : typeof value === 'object' ? (
                <Code block>{JSON.stringify(value, null, 2)}</Code>
              ) : (
                String(value) || 'null'
              )}
            </Group>
          ))}
        </Stack>
      </Stack>
    );
  };

  const basicConfig = config ? {
    appNameNavbar: config.appNameNavbar,
    baseUrl: config.baseUrl,
    contextPath: config.contextPath,
    serverPort: config.serverPort,
  } : null;

  const securityConfig = config ? {
    enableLogin: config.enableLogin,
  } : null;

  const systemConfig = config ? {
    enableAlphaFunctionality: config.enableAlphaFunctionality,
    enableAnalytics: config.enableAnalytics,
  } : null;

  const integrationConfig = config ? {
    SSOAutoLogin: config.SSOAutoLogin,
  } : null;

  if (loading) {
    return (
      <Stack align="center" py="md">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">{t('config.overview.loading', 'Loading configuration...')}</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert color="red" title={t('config.overview.error', 'Error')}>
        {error}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <OverviewHeader />

      {config && (
        <>
          {renderConfigSection(t('config.overview.sections.basic', 'Basic Configuration'), basicConfig)}
          {renderConfigSection(t('config.overview.sections.security', 'Security Configuration'), securityConfig)}
          {renderConfigSection(t('config.overview.sections.system', 'System Configuration'), systemConfig)}
          {renderConfigSection(t('config.overview.sections.integration', 'Integration Configuration'), integrationConfig)}

          {config.error && (
            <Alert color="yellow" title={t('config.overview.warning', 'Configuration Warning')}>
              {config.error}
            </Alert>
          )}
        </>
      )}
    </Stack>
  );
};

export default Overview;
