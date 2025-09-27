import React, { useState } from 'react';
import {
  Modal,
  Button,
  Stack,
  Text,
  Code,
  ScrollArea,
  Group,
  Badge,
  Alert,
  Loader,
  Tabs,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../../hooks/useAppConfig';
import HotkeysSection from '../settings/HotkeysSection';

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
}

const AppConfigModal: React.FC<AppConfigModalProps> = ({ opened, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>('config');
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

  const renderConfigDetails = () => (
    <Stack gap="lg">
      {loading && (
        <Stack align="center" py="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">{t('config.overview.loading', 'Loading configuration...')}</Text>
        </Stack>
      )}

      {error && (
        <Alert color="red" title={t('config.overview.errorTitle', 'Error')}>
          {error}
        </Alert>
      )}

      {!loading && !error && config && (
        <Stack gap="lg">
          {renderConfigSection(t('config.overview.basic', 'Basic Configuration'), basicConfig)}
          {renderConfigSection(t('config.overview.security', 'Security Configuration'), securityConfig)}
          {renderConfigSection(t('config.overview.system', 'System Configuration'), systemConfig)}
          {renderConfigSection(t('config.overview.premium', 'Premium/Enterprise Configuration'), premiumConfig)}
          {renderConfigSection(t('config.overview.integration', 'Integration Configuration'), integrationConfig)}
          {renderConfigSection(t('config.overview.legal', 'Legal Configuration'), legalConfig)}

          {config.error && (
            <Alert color="yellow" title={t('config.debug.warningTitle', 'Configuration Warning')}>
              {config.error}
            </Alert>
          )}

          <Stack gap="xs">
            <Text fw={600} size="md" c="blue">
              {t('config.debug.rawTitle', 'Raw Configuration')}
            </Text>
            <Code block style={{ fontSize: '11px' }}>
              {JSON.stringify(config, null, 2)}
            </Code>
          </Stack>
        </Stack>
      )}
    </Stack>
  );

  const renderApiKeys = () => (
    <Stack gap="md">
      <Text fw={600} size="lg">{t('config.apiKeys.title', 'Manage API Keys')}</Text>
      <Text size="sm" c="dimmed">
        {t('config.apiKeys.description', "Your API key for accessing Stirling's suite of PDF tools. Copy it to your project or refresh to generate a new one.")}
      </Text>
      <Alert color="blue" variant="light" radius="md">
        {t('config.apiKeys.guestInfo', 'Guest users do not receive API keys. Create an account to get an API key you can use in your applications.')}
      </Alert>
      <Group>
        <Button size="sm" variant="light">
          {t('config.apiKeys.goToAccount', 'Go to Account')}
        </Button>
        <Button size="sm" variant="outline">
          {t('config.apiKeys.refreshModal.confirmCta', 'Refresh Keys')}
        </Button>
      </Group>
    </Stack>
  );


  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('settings.title', 'Settings')}
      size="lg"
      style={{ zIndex: 1000 }}
      withinPortal
    >
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text size="sm" c="dimmed">
              {t('settings.subtitle', 'Manage your Stirling PDF experience in one place.')}
            </Text>
          </Stack>
          <Button size="xs" variant="light" onClick={refetch}>
            {t('common.refresh', 'Refresh')}
          </Button>
        </Group>

        <Tabs value={activeTab} onChange={(value) => value && setActiveTab(value)} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="overview">{t('config.account.overview.title', 'Overview')}</Tabs.Tab>
            <Tabs.Tab value="apiKeys">{t('config.apiKeys.label', 'API Keys')}</Tabs.Tab>
            <Tabs.Tab value="hotkeys">{t('config.hotkeys.title', 'Keyboard Shortcuts')}</Tabs.Tab>
            <Tabs.Tab value="config">{t('config.debug.title', 'Configuration Data')}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="md">
            <ScrollArea h={400} type="auto">
              {renderConfigDetails()}
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel value="apiKeys" pt="md">
            <ScrollArea h={400} type="auto">
              {renderApiKeys()}
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel value="hotkeys" pt="md">
            <ScrollArea h={400} type="auto">
              <HotkeysSection />
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel value="config" pt="md">
            <ScrollArea h={400} type="auto">
              {renderConfigDetails()}
            </ScrollArea>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Modal>
  );
};

export default AppConfigModal;
