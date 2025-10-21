import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, Badge } from '@mantine/core';
import { alert } from '../../../toast';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';

interface FeaturesSettingsData {
  serverCertificate?: {
    enabled?: boolean;
    organizationName?: string;
    validity?: number;
    regenerateOnStartup?: boolean;
  };
}

export default function AdminFeaturesSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();
  const [settings, setSettings] = useState<FeaturesSettingsData>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const systemResponse = await fetch('/api/v1/admin/settings/section/system');
      const systemData = systemResponse.ok ? await systemResponse.json() : {};

      setSettings({
        serverCertificate: systemData.serverCertificate || {
          enabled: true,
          organizationName: 'Stirling-PDF',
          validity: 365,
          regenerateOnStartup: false
        }
      });
    } catch (error) {
      console.error('Failed to fetch features settings:', error);
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
      // Save server certificate settings via delta endpoint
      const deltaSettings: Record<string, any> = {};

      if (settings.serverCertificate) {
        deltaSettings['system.serverCertificate.enabled'] = settings.serverCertificate.enabled;
        deltaSettings['system.serverCertificate.organizationName'] = settings.serverCertificate.organizationName;
        deltaSettings['system.serverCertificate.validity'] = settings.serverCertificate.validity;
        deltaSettings['system.serverCertificate.regenerateOnStartup'] = settings.serverCertificate.regenerateOnStartup;
      }

      const response = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: deltaSettings }),
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
        <Text fw={600} size="lg">{t('admin.settings.features.title', 'Features')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.features.description', 'Configure optional features and functionality.')}
        </Text>
      </div>

      {/* Server Certificate - Pro Feature */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">{t('admin.settings.features.serverCertificate', 'Server Certificate')}</Text>
            <Badge color="blue" size="sm">PRO</Badge>
          </Group>

          <Text size="xs" c="dimmed">
            {t('admin.settings.features.serverCertificate.description', 'Configure server-side certificate generation for "Sign with Stirling-PDF" functionality')}
          </Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.features.serverCertificate.enabled', 'Enable Server Certificate')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.features.serverCertificate.enabled.description', 'Enable server-side certificate for "Sign with Stirling-PDF" option')}
              </Text>
            </div>
            <Switch
              checked={settings.serverCertificate?.enabled ?? true}
              onChange={(e) => setSettings({
                ...settings,
                serverCertificate: { ...settings.serverCertificate, enabled: e.target.checked }
              })}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.features.serverCertificate.organizationName', 'Organization Name')}
              description={t('admin.settings.features.serverCertificate.organizationName.description', 'Organization name for generated certificates')}
              value={settings.serverCertificate?.organizationName || 'Stirling-PDF'}
              onChange={(e) => setSettings({
                ...settings,
                serverCertificate: { ...settings.serverCertificate, organizationName: e.target.value }
              })}
              placeholder="Stirling-PDF"
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.features.serverCertificate.validity', 'Certificate Validity (days)')}
              description={t('admin.settings.features.serverCertificate.validity.description', 'Number of days the certificate will be valid')}
              value={settings.serverCertificate?.validity ?? 365}
              onChange={(value) => setSettings({
                ...settings,
                serverCertificate: { ...settings.serverCertificate, validity: Number(value) }
              })}
              min={1}
              max={3650}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.features.serverCertificate.regenerateOnStartup', 'Regenerate on Startup')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.features.serverCertificate.regenerateOnStartup.description', 'Generate new certificate on each application startup')}
              </Text>
            </div>
            <Switch
              checked={settings.serverCertificate?.regenerateOnStartup ?? false}
              onChange={(e) => setSettings({
                ...settings,
                serverCertificate: { ...settings.serverCertificate, regenerateOnStartup: e.target.checked }
              })}
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
