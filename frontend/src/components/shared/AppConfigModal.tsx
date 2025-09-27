import React, { useMemo, useState } from 'react';
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
  ThemeIcon,
  Box,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../../hooks/useAppConfig';
import HotkeysSection from '../settings/HotkeysSection';
import LocalIcon from './LocalIcon';

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
}

const AppConfigModal: React.FC<AppConfigModalProps> = ({ opened, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>('overview');
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

  const sections = useMemo(() => ([
    {
      value: 'overview',
      label: t('config.account.overview.title', 'Overview'),
      description: t('config.account.overview.manageAccountPreferences', 'Manage your account preferences'),
      icon: 'dashboard-rounded',
    },
    {
      value: 'apiKeys',
      label: t('config.apiKeys.label', 'API Key'),
      description: t('config.apiKeys.description', "Your API key for accessing Stirling's suite of PDF tools. Copy it to your project or refresh to generate a new one."),
      icon: 'vpn-key-rounded',
    },
    {
      value: 'hotkeys',
      label: t('config.hotkeys.title', 'Keyboard Shortcuts'),
      description: t('config.hotkeys.description', 'View and customise tool shortcuts to speed up your workflow.'),
      icon: 'keyboard-rounded',
    },
    {
      value: 'debug',
      label: t('config.debug.title', 'Configuration Data'),
      description: t('config.debug.description', 'Inspect raw server configuration values for troubleshooting.'),
      icon: 'tune-rounded',
    },
  ]), [t]);

  const renderOverview = () => (
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

  const renderDebug = () => (
    <Stack gap="lg">
      {config && config.error && (
        <Alert color="yellow" title={t('config.debug.warningTitle', 'Configuration Warning')}>
          {config.error}
        </Alert>
      )}
      {config && (
        <Stack gap="xs">
          <Text fw={600} size="md" c="blue">{t('config.debug.rawTitle', 'Raw Configuration')}</Text>
          <Code block style={{ fontSize: '11px' }}>
            {JSON.stringify(config, null, 2)}
          </Code>
        </Stack>
      )}
    </Stack>
  );

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'apiKeys':
        return renderApiKeys();
      case 'hotkeys':
        return <HotkeysSection />;
      case 'debug':
        return renderDebug();
      default:
        return renderOverview();
    }
  };

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

        <Tabs
          value={activeTab}
          onChange={(value) => value && setActiveTab(value)}
          orientation="vertical"
          keepMounted={false}
          styles={{
            root: {
              display: 'flex',
              alignItems: 'stretch',
              gap: '1.5rem',
            },
            list: {
              minWidth: '15rem',
              paddingRight: '0.5rem',
              borderRight: '1px solid var(--mantine-color-gray-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            },
            tab: {
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              borderRadius: '0.75rem',
              padding: '0.75rem 1rem',
              fontWeight: 500,
            },
          }}
        >
          <Tabs.List>
            {sections.map((section) => (
              <Tabs.Tab
                key={section.value}
                value={section.value}
                leftSection={(
                  <ThemeIcon size={34} radius="md" variant={activeTab === section.value ? 'filled' : 'light'}>
                    <LocalIcon icon={section.icon} width="1.1rem" height="1.1rem" />
                  </ThemeIcon>
                )}
              >
                <Stack gap={2} align="flex-start" style={{ textAlign: 'left' }}>
                  <Text fw={600}>{section.label}</Text>
                  <Text size="xs" c="dimmed">
                    {section.description}
                  </Text>
                </Stack>
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Tabs.Panel value={activeTab} style={{ flex: 1 }}>
            <ScrollArea h={400} type="auto">
              <Box pr="sm">
                {renderActivePanel()}
              </Box>
            </ScrollArea>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Modal>
  );
};

export default AppConfigModal;
