import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Button, Stack, Paper, Text, Loader, Group } from '@mantine/core';
import { alert } from '@app/components/toast';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';
import apiClient from '@app/services/apiClient';

interface PrivacySettingsData {
  enableAnalytics?: boolean;
  googleVisibility?: boolean;
  metricsEnabled?: boolean;
}

export default function AdminPrivacySection() {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } = useLoginRequired();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<PrivacySettingsData>({
    sectionName: 'privacy',
    fetchTransformer: async () => {
      const [metricsResponse, systemResponse] = await Promise.all([
        apiClient.get('/api/v1/admin/settings/section/metrics'),
        apiClient.get('/api/v1/admin/settings/section/system')
      ]);

      const metrics = metricsResponse.data;
      const system = systemResponse.data;

      const result: any = {
        enableAnalytics: system.enableAnalytics || false,
        googleVisibility: system.googlevisibility || false,
        metricsEnabled: metrics.enabled || false
      };

      // Merge pending blocks from both endpoints
      const pendingBlock: any = {};
      if (system._pending?.enableAnalytics !== undefined) {
        pendingBlock.enableAnalytics = system._pending.enableAnalytics;
      }
      if (system._pending?.googlevisibility !== undefined) {
        pendingBlock.googleVisibility = system._pending.googlevisibility;
      }
      if (metrics._pending?.enabled !== undefined) {
        pendingBlock.metricsEnabled = metrics._pending.enabled;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: (settings) => {
      const deltaSettings = {
        'system.enableAnalytics': settings.enableAnalytics,
        'system.googlevisibility': settings.googleVisibility,
        'metrics.enabled': settings.metricsEnabled
      };

      return {
        sectionData: {},
        deltaSettings
      };
    }
  });

  useEffect(() => {
    if (loginEnabled) {
      fetchSettings();
    }
  }, [loginEnabled, fetchSettings]);

  const handleSave = async () => {
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      await saveSettings();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  // Override loading state when login is disabled
  const actualLoading = loginEnabled ? loading : false;

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <LoginRequiredBanner show={!loginEnabled} />

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
              <Text fw={500} size="sm">{t('admin.settings.privacy.enableAnalytics.label', 'Enable Analytics')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.privacy.enableAnalytics.description', 'Collect anonymous usage analytics to help improve the application')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings?.enableAnalytics || false}
                onChange={(e) => {
                  if (!loginEnabled) return;
                  setSettings({ ...settings, enableAnalytics: e.target.checked });
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('enableAnalytics')} />
            </Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.privacy.metricsEnabled.label', 'Enable Metrics')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.privacy.metricsEnabled.description', 'Enable collection of performance and usage metrics')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings?.metricsEnabled || false}
                onChange={(e) => {
                  if (!loginEnabled) return;
                  setSettings({ ...settings, metricsEnabled: e.target.checked });
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('metricsEnabled')} />
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* Search Engine Visibility */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.privacy.searchEngine', 'Search Engine Visibility')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.privacy.googleVisibility.label', 'Google Visibility')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.privacy.googleVisibility.description', 'Allow search engines to index this application')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings?.googleVisibility || false}
                onChange={(e) => {
                  if (!loginEnabled) return;
                  setSettings({ ...settings, googleVisibility: e.target.checked });
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('googleVisibility')} />
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* Save Button */}
      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} size="sm" disabled={!loginEnabled}>
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
