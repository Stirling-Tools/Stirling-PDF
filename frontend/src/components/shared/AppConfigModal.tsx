import React from 'react';
import { Modal, Button, Stack, Text, Code, ScrollArea, Group, Badge, Alert, Loader } from '@mantine/core';
import { useAppConfig } from '../../hooks/useAppConfig';

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
}

const AppConfigModal: React.FC<AppConfigModalProps> = ({ opened, onClose }) => {
  const { config, loading, error, refetch } = useAppConfig();

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

  const premiumConfig = config ? {
    premiumEnabled: config.premiumEnabled,
    premiumKey: config.premiumKey ? '***hidden***' : null,
    runningProOrHigher: config.runningProOrHigher,
    runningEE: config.runningEE,
    license: config.license,
  } : null;

  const integrationConfig = config ? {
    GoogleDriveEnabled: config.GoogleDriveEnabled,
    SSOAutoLogin: config.SSOAutoLogin,
  } : null;

  const legalConfig = config ? {
    termsAndConditions: config.termsAndConditions,
    privacyPolicy: config.privacyPolicy,
    cookiePolicy: config.cookiePolicy,
    impressum: config.impressum,
    accessibilityStatement: config.accessibilityStatement,
  } : null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="App Configuration (Testing)"
      size="lg"
      style={{ zIndex: 1000 }}
    >
      <Stack>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            This modal shows the current application configuration for testing purposes only.
          </Text>
          <Button size="xs" variant="light" onClick={refetch}>
            Refresh
          </Button>
        </Group>

        {loading && (
          <Stack align="center" py="md">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">Loading configuration...</Text>
          </Stack>
        )}

        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        {config && (
          <ScrollArea h={400}>
            <Stack gap="lg">
              {renderConfigSection('Basic Configuration', basicConfig)}
              {renderConfigSection('Security Configuration', securityConfig)}
              {renderConfigSection('System Configuration', systemConfig)}
              {renderConfigSection('Premium/Enterprise Configuration', premiumConfig)}
              {renderConfigSection('Integration Configuration', integrationConfig)}
              {renderConfigSection('Legal Configuration', legalConfig)}
              
              {config.error && (
                <Alert color="yellow" title="Configuration Warning">
                  {config.error}
                </Alert>
              )}

              <Stack gap="xs">
                <Text fw={600} size="md" c="blue">Raw Configuration</Text>
                <Code block style={{ fontSize: '11px' }}>
                  {JSON.stringify(config, null, 2)}
                </Code>
              </Stack>
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Modal>
  );
};

export default AppConfigModal;