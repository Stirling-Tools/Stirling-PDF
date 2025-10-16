import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, Select, PasswordInput } from '@mantine/core';
import { alert } from '../../../toast';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';

interface SecuritySettingsData {
  enableLogin?: boolean;
  csrfDisabled?: boolean;
  loginMethod?: string;
  loginAttemptCount?: number;
  loginResetTimeMinutes?: number;
  initialLogin?: {
    username?: string;
    password?: string;
  };
  jwt?: {
    persistence?: boolean;
    enableKeyRotation?: boolean;
    enableKeyCleanup?: boolean;
    keyRetentionDays?: number;
    secureCookie?: boolean;
  };
}

export default function AdminSecuritySection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();
  const [settings, setSettings] = useState<SecuritySettingsData>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/v1/admin/settings/section/security');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch security settings:', error);
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
      const response = await fetch('/api/v1/admin/settings/section/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
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

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">{t('admin.settings.security.title', 'Security')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.security.description', 'Configure authentication, login behaviour, and security policies.')}
        </Text>
      </div>

      {/* Authentication Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.security.authentication', 'Authentication')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.enableLogin', 'Enable Login')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.enableLogin.description', 'Require users to log in before accessing the application')}
              </Text>
            </div>
            <Switch
              checked={settings.enableLogin || false}
              onChange={(e) => setSettings({ ...settings, enableLogin: e.target.checked })}
            />
          </div>

          <div>
            <Select
              label={t('admin.settings.security.loginMethod', 'Login Method')}
              description={t('admin.settings.security.loginMethod.description', 'The authentication method to use for user login')}
              value={settings.loginMethod || 'all'}
              onChange={(value) => setSettings({ ...settings, loginMethod: value || 'all' })}
              data={[
                { value: 'all', label: t('admin.settings.security.loginMethod.all', 'All Methods') },
                { value: 'normal', label: t('admin.settings.security.loginMethod.normal', 'Username/Password Only') },
                { value: 'oauth2', label: t('admin.settings.security.loginMethod.oauth2', 'OAuth2 Only') },
                { value: 'saml2', label: t('admin.settings.security.loginMethod.saml2', 'SAML2 Only') },
              ]}
              comboboxProps={{ zIndex: 1400 }}
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.security.loginAttemptCount', 'Login Attempt Limit')}
              description={t('admin.settings.security.loginAttemptCount.description', 'Maximum number of failed login attempts before account lockout')}
              value={settings.loginAttemptCount || 0}
              onChange={(value) => setSettings({ ...settings, loginAttemptCount: Number(value) })}
              min={0}
              max={100}
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.security.loginResetTimeMinutes', 'Login Reset Time (minutes)')}
              description={t('admin.settings.security.loginResetTimeMinutes.description', 'Time before failed login attempts are reset')}
              value={settings.loginResetTimeMinutes || 0}
              onChange={(value) => setSettings({ ...settings, loginResetTimeMinutes: Number(value) })}
              min={0}
              max={1440}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.csrfDisabled', 'Disable CSRF Protection')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.csrfDisabled.description', 'Disable Cross-Site Request Forgery protection (not recommended)')}
              </Text>
            </div>
            <Switch
              checked={settings.csrfDisabled || false}
              onChange={(e) => setSettings({ ...settings, csrfDisabled: e.target.checked })}
            />
          </div>
        </Stack>
      </Paper>

      {/* Initial Login Credentials */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.security.initialLogin', 'Initial Login')}</Text>

          <div>
            <TextInput
              label={t('admin.settings.security.initialLogin.username', 'Initial Username')}
              description={t('admin.settings.security.initialLogin.username.description', 'Default admin username for first-time setup')}
              value={settings.initialLogin?.username || ''}
              onChange={(e) => setSettings({ ...settings, initialLogin: { ...settings.initialLogin, username: e.target.value } })}
              placeholder="admin"
            />
          </div>

          <div>
            <PasswordInput
              label={t('admin.settings.security.initialLogin.password', 'Initial Password')}
              description={t('admin.settings.security.initialLogin.password.description', 'Default admin password for first-time setup')}
              value={settings.initialLogin?.password || ''}
              onChange={(e) => setSettings({ ...settings, initialLogin: { ...settings.initialLogin, password: e.target.value } })}
              placeholder="••••••••"
            />
          </div>
        </Stack>
      </Paper>

      {/* JWT Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.security.jwt', 'JWT Configuration')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.jwt.persistence', 'Enable Key Persistence')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.jwt.persistence.description', 'Store JWT keys persistently (required for multi-instance deployments)')}
              </Text>
            </div>
            <Switch
              checked={settings.jwt?.persistence || false}
              onChange={(e) => setSettings({ ...settings, jwt: { ...settings.jwt, persistence: e.target.checked } })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.jwt.enableKeyRotation', 'Enable Key Rotation')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.jwt.enableKeyRotation.description', 'Automatically rotate JWT signing keys for improved security')}
              </Text>
            </div>
            <Switch
              checked={settings.jwt?.enableKeyRotation || false}
              onChange={(e) => setSettings({ ...settings, jwt: { ...settings.jwt, enableKeyRotation: e.target.checked } })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.jwt.enableKeyCleanup', 'Enable Key Cleanup')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.jwt.enableKeyCleanup.description', 'Automatically remove old JWT keys after retention period')}
              </Text>
            </div>
            <Switch
              checked={settings.jwt?.enableKeyCleanup || false}
              onChange={(e) => setSettings({ ...settings, jwt: { ...settings.jwt, enableKeyCleanup: e.target.checked } })}
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.security.jwt.keyRetentionDays', 'Key Retention Days')}
              description={t('admin.settings.security.jwt.keyRetentionDays.description', 'Number of days to retain old JWT keys for verification')}
              value={settings.jwt?.keyRetentionDays || 7}
              onChange={(value) => setSettings({ ...settings, jwt: { ...settings.jwt, keyRetentionDays: Number(value) } })}
              min={1}
              max={365}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.security.jwt.secureCookie', 'Secure Cookie')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.security.jwt.secureCookie.description', 'Require HTTPS for JWT cookies (recommended for production)')}
              </Text>
            </div>
            <Switch
              checked={settings.jwt?.secureCookie || false}
              onChange={(e) => setSettings({ ...settings, jwt: { ...settings.jwt, secureCookie: e.target.checked } })}
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

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </Stack>
  );
}
