import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Text, Loader, Group, Divider, Paper, Switch, Badge } from '@mantine/core';
import { alert } from '@app/components/toast';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import ProviderCard from '@app/components/shared/config/configSections/ProviderCard';
import { Provider, useAllProviders } from '@app/components/shared/config/configSections/providerDefinitions';
import apiClient from '@app/services/apiClient';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';

interface FeedbackFlags {
  noValidDocument?: boolean;
  errorProcessing?: boolean;
  errorMessage?: boolean;
}

interface FeedbackSettings {
  general?: { enabled?: boolean };
  channel?: FeedbackFlags;
  user?: FeedbackFlags;
}

interface TelegramSettingsData {
  enabled?: boolean;
  botToken?: string;
  botUsername?: string;
  pipelineInboxFolder?: string;
  customFolderSuffix?: boolean;
  enableAllowUserIDs?: boolean;
  allowUserIDs?: number[];
  enableAllowChannelIDs?: boolean;
  allowChannelIDs?: number[];
  processingTimeoutSeconds?: number;
  pollingIntervalMillis?: number;
  feedback?: FeedbackSettings;
}

interface ConnectionsSettingsData {
  oauth2?: {
    enabled?: boolean;
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    provider?: string;
    autoCreateUser?: boolean;
    blockRegistration?: boolean;
    useAsUsername?: string;
    scopes?: string;
    client?: {
      [key: string]: any;
    };
  };
  saml2?: {
    [key: string]: any;
  };
  mail?: {
    enabled?: boolean;
    enableInvites?: boolean;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    from?: string;
  };
  telegram?: TelegramSettingsData;
  ssoAutoLogin?: boolean;
}

export default function AdminConnectionsSection() {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } = useLoginRequired();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();
  const allProviders = useAllProviders();

  const adminSettings = useAdminSettings<ConnectionsSettingsData>({
    sectionName: 'connections',
    fetchTransformer: async () => {
      // Fetch security settings (oauth2, saml2)
      const securityResponse = await apiClient.get('/api/v1/admin/settings/section/security');
      const securityData = securityResponse.data || {};

      // Fetch mail settings
      const mailResponse = await apiClient.get('/api/v1/admin/settings/section/mail');
      const mailData = mailResponse.data || {};

      // Fetch premium settings for SSO Auto Login
      const premiumResponse = await apiClient.get('/api/v1/admin/settings/section/premium');
      const premiumData = premiumResponse.data || {};

      // Fetch Telegram settings
      const telegramResponse = await apiClient.get('/api/v1/admin/settings/section/telegram');
      const telegramData = telegramResponse.data || {};

      const result: any = {
        oauth2: securityData.oauth2 || {},
        saml2: securityData.saml2 || {},
        mail: mailData || {},
        telegram: telegramData || {},
        ssoAutoLogin: premiumData.proFeatures?.ssoAutoLogin || false
      };

      // Merge pending blocks from all endpoints
      const pendingBlock: any = {};
      if (securityData._pending?.oauth2) {
        pendingBlock.oauth2 = securityData._pending.oauth2;
      }
      if (securityData._pending?.saml2) {
        pendingBlock.saml2 = securityData._pending.saml2;
      }
      if (mailData._pending) {
        pendingBlock.mail = mailData._pending;
      }
      if (telegramData._pending) {
        pendingBlock.telegram = telegramData._pending;
      }
      if (premiumData._pending?.proFeatures?.ssoAutoLogin !== undefined) {
        pendingBlock.ssoAutoLogin = premiumData._pending.proFeatures.ssoAutoLogin;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: () => {
      // This section doesn't have a global save button
      // Individual providers save through their own handlers
      return {
        sectionData: {},
        deltaSettings: {}
      };
    }
  });

  const {
    settings,
    setSettings,
    loading,
    fetchSettings,
    isFieldPending,
  } = adminSettings;

  useEffect(() => {
    if (loginEnabled) {
      fetchSettings();
    }
  }, [loginEnabled, fetchSettings]);

  // Override loading state when login is disabled
  const actualLoading = loginEnabled ? loading : false;

  const isProviderConfigured = (provider: Provider): boolean => {
    if (provider.id === 'saml2') {
      return settings?.saml2?.enabled === true;
    }

    if (provider.id === 'smtp') {
      return settings?.mail?.enabled === true;
    }

    if (provider.id === 'telegram') {
      return settings?.telegram?.enabled === true;
    }

    if (provider.id === 'oauth2-generic') {
      return settings?.oauth2?.enabled === true;
    }

    // Check if specific OAuth2 provider is configured (has clientId)
    const providerSettings = settings?.oauth2?.client?.[provider.id];
    return !!(providerSettings?.clientId);
  };

  const getProviderSettings = (provider: Provider): Record<string, any> => {
    if (provider.id === 'saml2') {
      return settings?.saml2 || {};
    }

    if (provider.id === 'smtp') {
      return settings?.mail || {};
    }

    if (provider.id === 'telegram') {
      return settings?.telegram || {};
    }

    if (provider.id === 'oauth2-generic') {
      // Generic OAuth2 settings are at the root oauth2 level
      return {
        enabled: settings?.oauth2?.enabled,
        provider: settings?.oauth2?.provider,
        issuer: settings?.oauth2?.issuer,
        clientId: settings?.oauth2?.clientId,
        clientSecret: settings?.oauth2?.clientSecret,
        scopes: settings?.oauth2?.scopes,
        useAsUsername: settings?.oauth2?.useAsUsername,
        autoCreateUser: settings?.oauth2?.autoCreateUser,
        blockRegistration: settings?.oauth2?.blockRegistration,
      };
    }

    // Specific OAuth2 provider settings
    return settings?.oauth2?.client?.[provider.id] || {};
  };

  const handleProviderSave = async (provider: Provider, providerSettings: Record<string, any>) => {
    // Block save if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      if (provider.id === 'smtp') {
        // Mail settings use a different endpoint
        const response = await apiClient.put('/api/v1/admin/settings/section/mail', providerSettings);

        if (response.status === 200) {
          await fetchSettings(); // Refresh settings
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.saveSuccess', 'Settings saved successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to save');
        }
      } else if (provider.id === 'telegram') {
        const parseToNumberArray = (values: any) =>
          (Array.isArray(values) ? values : [])
            .map((value) => Number(value))
            .filter((value) => !Number.isNaN(value));

        const response = await apiClient.put('/api/v1/admin/settings/section/telegram', {
          ...providerSettings,
          allowUserIDs: parseToNumberArray(providerSettings.allowUserIDs),
          allowChannelIDs: parseToNumberArray(providerSettings.allowChannelIDs),
          processingTimeoutSeconds: providerSettings.processingTimeoutSeconds
            ? Number(providerSettings.processingTimeoutSeconds)
            : undefined,
          pollingIntervalMillis: providerSettings.pollingIntervalMillis
            ? Number(providerSettings.pollingIntervalMillis)
            : undefined,
        });

        if (response.status === 200) {
          await fetchSettings(); // Refresh settings
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.saveSuccess', 'Settings saved successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to save');
        }
      } else {
        // OAuth2/SAML2 use delta settings
        const deltaSettings: Record<string, any> = {};

        if (provider.id === 'saml2') {
          // SAML2 settings
          Object.keys(providerSettings).forEach((key) => {
            deltaSettings[`security.saml2.${key}`] = providerSettings[key];
          });
        } else if (provider.id === 'oauth2-generic') {
          // Generic OAuth2 settings at root level
          Object.keys(providerSettings).forEach((key) => {
            deltaSettings[`security.oauth2.${key}`] = providerSettings[key];
          });
        } else {
          // Specific OAuth2 provider (google, github, keycloak)
          Object.keys(providerSettings).forEach((key) => {
            deltaSettings[`security.oauth2.client.${provider.id}.${key}`] = providerSettings[key];
          });
        }

        const response = await apiClient.put('/api/v1/admin/settings', { settings: deltaSettings });

        if (response.status === 200) {
          await fetchSettings(); // Refresh settings
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.saveSuccess', 'Settings saved successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to save');
        }
      }
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  const handleProviderDisconnect = async (provider: Provider) => {
    // Block disconnect if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      if (provider.id === 'smtp') {
        // Mail settings use a different endpoint
        const response = await apiClient.put('/api/v1/admin/settings/section/mail', { enabled: false });

        if (response.status === 200) {
          await fetchSettings();
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.connections.disconnected', 'Provider disconnected successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to disconnect');
        }
      } else if (provider.id === 'telegram') {
        const response = await apiClient.put('/api/v1/admin/settings/section/telegram', {
          enabled: false,
        });

        if (response.status === 200) {
          await fetchSettings();
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.connections.disconnected', 'Provider disconnected successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to disconnect');
        }
      } else {
        const deltaSettings: Record<string, any> = {};

        if (provider.id === 'saml2') {
          deltaSettings['security.saml2.enabled'] = false;
        } else if (provider.id === 'oauth2-generic') {
          deltaSettings['security.oauth2.enabled'] = false;
        } else {
          // Clear all fields for specific OAuth2 provider
          provider.fields.forEach((field) => {
            deltaSettings[`security.oauth2.client.${provider.id}.${field.key}`] = '';
          });
        }

        const response = await apiClient.put('/api/v1/admin/settings', { settings: deltaSettings });

        if (response.status === 200) {
          await fetchSettings();
          alert({
            alertType: 'success',
            title: t('admin.success', 'Success'),
            body: t('admin.settings.connections.disconnected', 'Provider disconnected successfully'),
          });
          showRestartModal();
        } else {
          throw new Error('Failed to disconnect');
        }
      }
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.connections.disconnectError', 'Failed to disconnect provider'),
      });
    }
  };

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const handleSSOAutoLoginSave = async () => {
    // Block save if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      const deltaSettings = {
        'premium.proFeatures.ssoAutoLogin': settings?.ssoAutoLogin
      };

      const response = await apiClient.put('/api/v1/admin/settings', { settings: deltaSettings });

      if (response.status === 200) {
        alert({
          alertType: 'success',
          title: t('admin.success', 'Success'),
          body: t('admin.settings.saveSuccess', 'Settings saved successfully'),
        });
        showRestartModal();
      } else {
        throw new Error('Failed to save');
      }
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  const linkedProviders = allProviders.filter((p) => isProviderConfigured(p));
  const availableProviders = allProviders.filter((p) => !isProviderConfigured(p));

  return (
    <Stack gap="xl">
      <LoginRequiredBanner show={!loginEnabled} />

      {/* Header */}
      <div>
        <Text fw={600} size="lg">
          {t('admin.settings.connections.title', 'Connections')}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            'admin.settings.connections.description',
            'Configure external authentication providers like OAuth2 and SAML.'
          )}
        </Text>
      </div>

      {/* SSO Auto Login - Premium Feature */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">{t('admin.settings.connections.ssoAutoLogin.label', 'SSO Auto Login')}</Text>
            <Badge color="yellow" size="sm">PRO</Badge>
          </Group>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.connections.ssoAutoLogin.enable', 'Enable SSO Auto Login')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.connections.ssoAutoLogin.description', 'Automatically redirect to SSO login when authentication is required')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings?.ssoAutoLogin || false}
                onChange={(e) => {
                  if (!loginEnabled) return; // Block change when login disabled
                  setSettings({ ...settings, ssoAutoLogin: e.target.checked });
                  handleSSOAutoLoginSave();
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('ssoAutoLogin')} />
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* Linked Services Section - Only show if there are linked providers */}
      {linkedProviders.length > 0 && (
        <>
          <div>
            <Text fw={600} size="md" mb="md">
              {t('admin.settings.connections.linkedServices', 'Linked Services')}
            </Text>
            <Stack gap="sm">
              {linkedProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isConfigured={true}
                  settings={getProviderSettings(provider)}
                  onSave={(providerSettings) => handleProviderSave(provider, providerSettings)}
                  onDisconnect={() => handleProviderDisconnect(provider)}
                  disabled={!loginEnabled}
                />
              ))}
            </Stack>
          </div>

          {/* Divider between sections */}
          {availableProviders.length > 0 && <Divider />}
        </>
      )}

      {/* Unlinked Services Section */}
      {availableProviders.length > 0 && (
        <div>
          <Text fw={600} size="md" mb="md">
            {t('admin.settings.connections.unlinkedServices', 'Unlinked Services')}
          </Text>
          <Stack gap="sm">
            {availableProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isConfigured={false}
                settings={getProviderSettings(provider)}
                onSave={(providerSettings) => handleProviderSave(provider, providerSettings)}
                disabled={!loginEnabled}
              />
            ))}
          </Stack>
        </div>
      )}

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </Stack>
  );
}
