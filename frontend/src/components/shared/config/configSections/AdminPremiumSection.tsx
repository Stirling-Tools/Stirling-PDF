import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Switch, Button, Stack, Paper, Text, Loader, Group, Alert } from '@mantine/core';
import { alert } from '../../../toast';
import LocalIcon from '../../LocalIcon';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';

interface PremiumSettingsData {
  key?: string;
  enabled?: boolean;
}

export default function AdminPremiumSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PremiumSettingsData>({});
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/v1/admin/settings/section/premium');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch premium settings:', error);
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
      const response = await fetch('/api/v1/admin/settings/section/premium', {
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
        <Text fw={600} size="lg">{t('admin.settings.premium.title', 'Premium & Enterprise')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.premium.description', 'Configure your premium or enterprise license key.')}
        </Text>
      </div>

      {/* Notice about moved features */}
      <Alert
        variant="light"
        color="blue"
        title={t('admin.settings.premium.movedFeatures.title', 'Premium Features Distributed')}
        icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
      >
        <Text size="sm">
          {t('admin.settings.premium.movedFeatures.message', 'Premium and Enterprise features are now organized in their respective sections:')}
        </Text>
        <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
          <li><Text size="sm" component="span"><strong>SSO Auto Login</strong> (PRO) - Connections</Text></li>
          <li><Text size="sm" component="span"><strong>Custom Metadata</strong> (PRO) - General</Text></li>
          <li><Text size="sm" component="span"><strong>Audit Logging</strong> (ENTERPRISE) - Security</Text></li>
          <li><Text size="sm" component="span"><strong>Database Configuration</strong> (ENTERPRISE) - Database</Text></li>
        </ul>
      </Alert>

      {/* License Configuration */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.premium.license', 'License Configuration')}</Text>

          <div>
            <TextInput
              label={t('admin.settings.premium.key', 'License Key')}
              description={t('admin.settings.premium.key.description', 'Enter your premium or enterprise license key')}
              value={settings.key || ''}
              onChange={(e) => setSettings({ ...settings, key: e.target.value })}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.premium.enabled', 'Enable Premium Features')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.premium.enabled.description', 'Enable license key checks for pro/enterprise features')}
              </Text>
            </div>
            <Switch
              checked={settings.enabled || false}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
          </div>
        </Stack>
      </Paper>

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
