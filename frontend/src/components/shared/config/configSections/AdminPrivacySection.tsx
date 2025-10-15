import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Button, Stack, Paper, Text, Loader, Group } from '@mantine/core';
import { alert } from '../../../toast';

interface PrivacySettingsData {
  enableAnalytics?: boolean;
  googleVisibility?: boolean;
  metricsEnabled?: boolean;
}

export default function AdminPrivacySection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PrivacySettingsData>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      // Fetch metrics and system sections
      const [metricsResponse, systemResponse] = await Promise.all([
        fetch('/api/v1/admin/settings/section/metrics'),
        fetch('/api/v1/admin/settings/section/system')
      ]);

      if (metricsResponse.ok && systemResponse.ok) {
        const metrics = await metricsResponse.json();
        const system = await systemResponse.json();

        setSettings({
          enableAnalytics: system.enableAnalytics || false,
          googleVisibility: system.googlevisibility || false,
          metricsEnabled: metrics.enabled || false
        });
      }
    } catch (error) {
      console.error('Failed to fetch privacy settings:', error);
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
      // Use delta update endpoint with dot notation for cross-section settings
      const deltaSettings = {
        'system.enableAnalytics': settings.enableAnalytics,
        'system.googlevisibility': settings.googleVisibility,
        'metrics.enabled': settings.metricsEnabled
      };

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

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">{t('admin.settings.privacy.title', 'Privacy')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.privacy.description', 'Configure privacy and data collection settings.')}
        </Text>
      </div>

      {/* Analytics & Tracking */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.privacy.analytics', 'Analytics & Tracking')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.privacy.enableAnalytics', 'Enable Analytics')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.privacy.enableAnalytics.description', 'Collect anonymous usage analytics to help improve the application')}
              </Text>
            </div>
            <Switch
              checked={settings.enableAnalytics || false}
              onChange={(e) => setSettings({ ...settings, enableAnalytics: e.target.checked })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.privacy.metricsEnabled', 'Enable Metrics')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.privacy.metricsEnabled.description', 'Enable collection of performance and usage metrics')}
              </Text>
            </div>
            <Switch
              checked={settings.metricsEnabled || false}
              onChange={(e) => setSettings({ ...settings, metricsEnabled: e.target.checked })}
            />
          </div>
        </Stack>
      </Paper>

      {/* Search Engine Visibility */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.privacy.searchEngine', 'Search Engine Visibility')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.privacy.googleVisibility', 'Google Visibility')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.privacy.googleVisibility.description', 'Allow search engines to index this application')}
              </Text>
            </div>
            <Switch
              checked={settings.googleVisibility || false}
              onChange={(e) => setSettings({ ...settings, googleVisibility: e.target.checked })}
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
