import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Switch, Button, Stack, Paper, Text, Loader, Group, Select, Badge, PasswordInput } from '@mantine/core';
import { alert } from '../../../toast';
import LocalIcon from '../../LocalIcon';

interface OAuth2Settings {
  enabled?: boolean;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  provider?: string;
  autoCreateUser?: boolean;
  blockRegistration?: boolean;
  useAsUsername?: string;
  scopes?: string;
}

interface SAML2Settings {
  enabled?: boolean;
  provider?: string;
  autoCreateUser?: boolean;
  blockRegistration?: boolean;
  registrationId?: string;
}

interface ConnectionsSettingsData {
  oauth2?: OAuth2Settings;
  saml2?: SAML2Settings;
}

export default function AdminConnectionsSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ConnectionsSettingsData>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      // OAuth2 and SAML2 are nested under security section
      const response = await fetch('/api/v1/admin/settings/section/security');
      if (response.ok) {
        const data = await response.json();
        // Extract oauth2 and saml2 from security section
        setSettings({
          oauth2: data.oauth2 || {},
          saml2: data.saml2 || {}
        });
      }
    } catch (error) {
      console.error('Failed to fetch connections settings:', error);
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.fetchError', 'Failed to load settings'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Use delta update endpoint with dot notation for nested oauth2/saml2 settings
      const deltaSettings: Record<string, any> = {};

      // Convert oauth2 settings to dot notation
      if (settings.oauth2) {
        Object.keys(settings.oauth2).forEach(key => {
          deltaSettings[`security.oauth2.${key}`] = (settings.oauth2 as any)[key];
        });
      }

      // Convert saml2 settings to dot notation
      if (settings.saml2) {
        Object.keys(settings.saml2).forEach(key => {
          deltaSettings[`security.saml2.${key}`] = (settings.saml2 as any)[key];
        });
      }

      const response = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: deltaSettings }),
      });

      if (response.ok) {
        alert({
          alertType: 'success',
          title: t('admin.success', 'Success'),
          body: t('admin.settings.saved', 'Settings saved. Restart required for changes to take effect.'),
        });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const getProviderIcon = (provider?: string) => {
    switch (provider?.toLowerCase()) {
      case 'google':
        return <LocalIcon icon="google-rounded" width="1rem" height="1rem" />;
      case 'github':
        return <LocalIcon icon="github-rounded" width="1rem" height="1rem" />;
      case 'keycloak':
        return <LocalIcon icon="key-rounded" width="1rem" height="1rem" />;
      default:
        return <LocalIcon icon="cloud-rounded" width="1rem" height="1rem" />;
    }
  };

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">{t('admin.settings.connections.title', 'Connections')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.connections.description', 'Configure external authentication providers like OAuth2 and SAML.')}
        </Text>
      </div>

      {/* OAuth2 Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <LocalIcon icon="cloud-rounded" width="1.25rem" height="1.25rem" />
              <Text fw={600} size="sm">{t('admin.settings.connections.oauth2', 'OAuth2')}</Text>
            </Group>
            <Badge color={settings.oauth2?.enabled ? 'green' : 'gray'} size="sm">
              {settings.oauth2?.enabled ? t('admin.status.active', 'Active') : t('admin.status.inactive', 'Inactive')}
            </Badge>
          </Group>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.connections.oauth2.enabled', 'Enable OAuth2')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.connections.oauth2.enabled.description', 'Allow users to authenticate using OAuth2 providers')}
              </Text>
            </div>
            <Switch
              checked={settings.oauth2?.enabled || false}
              onChange={(e) => setSettings({ ...settings, oauth2: { ...settings.oauth2, enabled: e.target.checked } })}
            />
          </div>

          <div>
            <Select
              label={t('admin.settings.connections.oauth2.provider', 'Provider')}
              description={t('admin.settings.connections.oauth2.provider.description', 'The OAuth2 provider to use for authentication')}
              value={settings.oauth2?.provider || ''}
              onChange={(value) => setSettings({ ...settings, oauth2: { ...settings.oauth2, provider: value || '' } })}
              data={[
                { value: 'google', label: 'Google' },
                { value: 'github', label: 'GitHub' },
                { value: 'keycloak', label: 'Keycloak' },
              ]}
              leftSection={getProviderIcon(settings.oauth2?.provider)}
              comboboxProps={{ zIndex: 1400 }}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.connections.oauth2.issuer', 'Issuer URL')}
              description={t('admin.settings.connections.oauth2.issuer.description', 'The OAuth2 provider issuer URL')}
              value={settings.oauth2?.issuer || ''}
              onChange={(e) => setSettings({ ...settings, oauth2: { ...settings.oauth2, issuer: e.target.value } })}
              placeholder="https://accounts.google.com"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.connections.oauth2.clientId', 'Client ID')}
              description={t('admin.settings.connections.oauth2.clientId.description', 'The OAuth2 client ID from your provider')}
              value={settings.oauth2?.clientId || ''}
              onChange={(e) => setSettings({ ...settings, oauth2: { ...settings.oauth2, clientId: e.target.value } })}
            />
          </div>

          <div>
            <PasswordInput
              label={t('admin.settings.connections.oauth2.clientSecret', 'Client Secret')}
              description={t('admin.settings.connections.oauth2.clientSecret.description', 'The OAuth2 client secret from your provider')}
              value={settings.oauth2?.clientSecret || ''}
              onChange={(e) => setSettings({ ...settings, oauth2: { ...settings.oauth2, clientSecret: e.target.value } })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.connections.oauth2.autoCreateUser', 'Auto Create Users')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.connections.oauth2.autoCreateUser.description', 'Automatically create user accounts on first OAuth2 login')}
              </Text>
            </div>
            <Switch
              checked={settings.oauth2?.autoCreateUser || false}
              onChange={(e) => setSettings({ ...settings, oauth2: { ...settings.oauth2, autoCreateUser: e.target.checked } })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.connections.oauth2.blockRegistration', 'Block Registration')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.connections.oauth2.blockRegistration.description', 'Prevent new user registration via OAuth2')}
              </Text>
            </div>
            <Switch
              checked={settings.oauth2?.blockRegistration || false}
              onChange={(e) => setSettings({ ...settings, oauth2: { ...settings.oauth2, blockRegistration: e.target.checked } })}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.connections.oauth2.useAsUsername', 'Use as Username')}
              description={t('admin.settings.connections.oauth2.useAsUsername.description', 'The OAuth2 claim to use as the username (e.g., email, sub)')}
              value={settings.oauth2?.useAsUsername || ''}
              onChange={(e) => setSettings({ ...settings, oauth2: { ...settings.oauth2, useAsUsername: e.target.value } })}
              placeholder="email"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.connections.oauth2.scopes', 'Scopes')}
              description={t('admin.settings.connections.oauth2.scopes.description', 'OAuth2 scopes (comma-separated, e.g., openid, profile, email)')}
              value={settings.oauth2?.scopes || ''}
              onChange={(e) => setSettings({ ...settings, oauth2: { ...settings.oauth2, scopes: e.target.value } })}
              placeholder="openid, profile, email"
            />
          </div>
        </Stack>
      </Paper>

      {/* SAML2 Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <LocalIcon icon="key-rounded" width="1.25rem" height="1.25rem" />
              <Text fw={600} size="sm">{t('admin.settings.connections.saml2', 'SAML2')}</Text>
            </Group>
            <Badge color={settings.saml2?.enabled ? 'green' : 'gray'} size="sm">
              {settings.saml2?.enabled ? t('admin.status.active', 'Active') : t('admin.status.inactive', 'Inactive')}
            </Badge>
          </Group>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.connections.saml2.enabled', 'Enable SAML2')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.connections.saml2.enabled.description', 'Allow users to authenticate using SAML2 providers')}
              </Text>
            </div>
            <Switch
              checked={settings.saml2?.enabled || false}
              onChange={(e) => setSettings({ ...settings, saml2: { ...settings.saml2, enabled: e.target.checked } })}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.connections.saml2.provider', 'Provider')}
              description={t('admin.settings.connections.saml2.provider.description', 'The SAML2 provider name')}
              value={settings.saml2?.provider || ''}
              onChange={(e) => setSettings({ ...settings, saml2: { ...settings.saml2, provider: e.target.value } })}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.connections.saml2.registrationId', 'Registration ID')}
              description={t('admin.settings.connections.saml2.registrationId.description', 'The SAML2 registration identifier')}
              value={settings.saml2?.registrationId || ''}
              onChange={(e) => setSettings({ ...settings, saml2: { ...settings.saml2, registrationId: e.target.value } })}
              placeholder="stirling"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.connections.saml2.autoCreateUser', 'Auto Create Users')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.connections.saml2.autoCreateUser.description', 'Automatically create user accounts on first SAML2 login')}
              </Text>
            </div>
            <Switch
              checked={settings.saml2?.autoCreateUser || false}
              onChange={(e) => setSettings({ ...settings, saml2: { ...settings.saml2, autoCreateUser: e.target.checked } })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.connections.saml2.blockRegistration', 'Block Registration')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.connections.saml2.blockRegistration.description', 'Prevent new user registration via SAML2')}
              </Text>
            </div>
            <Switch
              checked={settings.saml2?.blockRegistration || false}
              onChange={(e) => setSettings({ ...settings, saml2: { ...settings.saml2, blockRegistration: e.target.checked } })}
            />
          </div>
        </Stack>
      </Paper>

      {/* Save Button */}
      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} size="sm">
          {t('admin.settings.save', 'Save Changes')}
        </Button>
      </Group>
    </Stack>
  );
}
