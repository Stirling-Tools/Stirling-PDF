import React from 'react';
import { Stack, Text, Code, Group, Badge, Alert, Loader } from '@mantine/core';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { OverviewHeader } from '@app/components/shared/config/OverviewHeader';

const Overview: React.FC = () => {
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
    appName: config.appName,
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
        <Text size="sm" c="dimmed">Loading configuration...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Error">
        {error}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <OverviewHeader />

      {config && (
        <>
          {renderConfigSection('Basic Configuration', basicConfig)}
          {renderConfigSection('Security Configuration', securityConfig)}
          {renderConfigSection('System Configuration', systemConfig)}
          {renderConfigSection('Integration Configuration', integrationConfig)}

          {config.error && (
            <Alert color="yellow" title="Configuration Warning">
              {config.error}
            </Alert>
          )}
        </>
      )}
    </Stack>
  );
};

export default Overview;
