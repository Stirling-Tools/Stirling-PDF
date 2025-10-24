import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Text, Loader, Group, Divider, Paper, Switch, Badge } from '@mantine/core';
import { alert } from '../../../toast';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';
import { useAdminSettings } from '../../../../hooks/useAdminSettings';
import PendingBadge from '../PendingBadge';
import ProviderCard from './ProviderCard';
import {
  ALL_PROVIDERS,
  OAUTH2_PROVIDERS,
  GENERIC_OAUTH2_PROVIDER,
  SAML2_PROVIDER,
  Provider,
} from './providerDefinitions';
import apiClient from '../../../../services/apiClient';

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
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    from?: string;
  };
  ssoAutoLogin?: boolean;
}

export default function AdminConnectionsSection() {
  const { t } = useTranslation();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    fetchSettings,
    isFieldPending,
  } = useAdminSettings<ConnectionsSettingsData>({
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

      const result: any = {
        oauth2: securityData.oauth2 || {},
        saml2: securityData.saml2 || {},
        mail: mailData || {},
        ssoAutoLogin: premiumData.proFeatures?.ssoAutoLogin || false
      };

      // Merge pending blocks from all three endpoints
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
      if (premiumData._pending?.proFeatures?.ssoAutoLogin !== undefined) {
        pendingBlock.ssoAutoLogin = premiumData._pending.proFeatures.ssoAutoLogin;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: (settings) => {
      // This section doesn't have a global save button
      // Individual providers save through their own handlers
      return {
        sectionData: {},
        deltaSettings: {}
      };
    }
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const isProviderConfigured = (provider: Provider): boolean => {
    if (provider.id === 'saml2') {
      return settings.saml2?.enabled === true;
    }

    if (provider.id === 'smtp') {
      return settings.mail?.enabled === true;
    }

    if (provider.id === 'oauth2-generic') {
      return settings.oauth2?.enabled === true;
    }

    // Check if specific OAuth2 provider is configured (has clientId)
    const providerSettings = settings.oauth2?.client?.[provider.id];
    return !!(providerSettings?.clientId);
  };

  const getProviderSettings = (provider: Provider): Record<string, any> => {
    if (provider.id === 'saml2') {
      return settings.saml2 || {};
    }

    if (provider.id === 'smtp') {
      return settings.mail || {};
    }

    if (provider.id === 'oauth2-generic') {
      // Generic OAuth2 settings are at the root oauth2 level
      return {
        enabled: settings.oauth2?.enabled,
        provider: settings.oauth2?.provider,
        issuer: settings.oauth2?.issuer,
        clientId: settings.oauth2?.clientId,
        clientSecret: settings.oauth2?.clientSecret,
        scopes: settings.oauth2?.scopes,
        useAsUsername: settings.oauth2?.useAsUsername,
        autoCreateUser: settings.oauth2?.autoCreateUser,
        blockRegistration: settings.oauth2?.blockRegistration,
      };
    }

    // Specific OAuth2 provider settings
    return settings.oauth2?.client?.[provider.id] || {};
  };

  const handleProviderSave = async (provider: Provider, providerSettings: Record<string, any>) => {
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
    } catch (error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  const handleProviderDisconnect = async (provider: Provider) => {
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
    } catch (error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.connections.disconnectError', 'Failed to disconnect provider'),
      });
    }
  };

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const handleSSOAutoLoginSave = async () => {
    try {
      const deltaSettings = {
        'premium.proFeatures.ssoAutoLogin': settings.ssoAutoLogin
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
    } catch (error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  const linkedProviders = ALL_PROVIDERS.filter((p) => isProviderConfigured(p));
  const availableProviders = ALL_PROVIDERS.filter((p) => !isProviderConfigured(p));

  return (
    <Stack gap="xl">
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
            <Text fw={600} size="sm">{t('admin.settings.connections.ssoAutoLogin', 'SSO Auto Login')}</Text>
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
                checked={settings.ssoAutoLogin || false}
                onChange={(e) => {
                  setSettings({ ...settings, ssoAutoLogin: e.target.checked });
                  handleSSOAutoLoginSave();
                }}
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
                onSave={(providerSettings) => handleProviderSave(provider, providerSettings)}
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
