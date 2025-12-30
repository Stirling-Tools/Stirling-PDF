import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TextInput, NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group, Badge } from '@mantine/core';
import { alert } from '@app/components/toast';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import apiClient from '@app/services/apiClient';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';

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
  const navigate = useNavigate();
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
  } = useAdminSettings<FeaturesSettingsData>({
    sectionName: 'features',
    fetchTransformer: async () => {
      const systemResponse = await apiClient.get('/api/v1/admin/settings/section/system');
      const systemData = systemResponse.data || {};

      const result: any = {
        serverCertificate: systemData.serverCertificate || {
          enabled: true,
          organizationName: 'Stirling-PDF',
          validity: 365,
          regenerateOnStartup: false
        }
      };

      // Map pending changes from system._pending.serverCertificate
      if (systemData._pending?.serverCertificate) {
        result._pending = { serverCertificate: systemData._pending.serverCertificate };
      }

      return result;
    },
    saveTransformer: (settings) => {
      const deltaSettings: Record<string, any> = {};

      if (settings.serverCertificate) {
        deltaSettings['system.serverCertificate.enabled'] = settings.serverCertificate.enabled;
        deltaSettings['system.serverCertificate.organizationName'] = settings.serverCertificate.organizationName;
        deltaSettings['system.serverCertificate.validity'] = settings.serverCertificate.validity;
        deltaSettings['system.serverCertificate.regenerateOnStartup'] = settings.serverCertificate.regenerateOnStartup;
      }

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
  }, [loginEnabled]);

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
        <Text fw={600} size="lg">{t('admin.settings.features.title', 'Features')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.features.description', 'Configure optional features and functionality.')}
        </Text>
      </div>

      {/* Server Certificate - Pro Feature */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">{t('admin.settings.features.serverCertificate.label', 'Server Certificate')}</Text>
            <Badge
              color="grape"
              size="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/settings/adminPlan')}
              title={t('admin.settings.badge.clickToUpgrade', 'Click to view plan details')}
            >
              PRO
            </Badge>
          </Group>

          <Text size="xs" c="dimmed">
            {t('admin.settings.features.serverCertificate.description', 'Configure server-side certificate generation for "Sign with Stirling-PDF" functionality')}
          </Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.features.serverCertificate.enabled.label', 'Enable Server Certificate')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.features.serverCertificate.enabled.description', 'Enable server-side certificate for "Sign with Stirling-PDF" option')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.serverCertificate?.enabled ?? true}
                onChange={(e) => {
                  if (!loginEnabled) return;
                  setSettings({
                    ...settings,
                    serverCertificate: { ...settings.serverCertificate, enabled: e.target.checked }
                  });
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('serverCertificate.enabled')} />
            </Group>
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.features.serverCertificate.organizationName.label', 'Organization Name')}</span>
                  <PendingBadge show={isFieldPending('serverCertificate.organizationName')} />
                </Group>
              }
              description={t('admin.settings.features.serverCertificate.organizationName.description', 'Organization name for generated certificates')}
              value={settings.serverCertificate?.organizationName || 'Stirling-PDF'}
              onChange={(e) => setSettings({
                ...settings,
                serverCertificate: { ...settings.serverCertificate, organizationName: e.target.value }
              })}
              placeholder="Stirling-PDF"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <NumberInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.features.serverCertificate.validity.label', 'Certificate Validity (days)')}</span>
                  <PendingBadge show={isFieldPending('serverCertificate.validity')} />
                </Group>
              }
              description={t('admin.settings.features.serverCertificate.validity.description', 'Number of days the certificate will be valid')}
              value={settings.serverCertificate?.validity ?? 365}
              onChange={(value) => setSettings({
                ...settings,
                serverCertificate: { ...settings.serverCertificate, validity: Number(value) }
              })}
              min={1}
              max={3650}
              disabled={!loginEnabled}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.features.serverCertificate.regenerateOnStartup.label', 'Regenerate on Startup')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.features.serverCertificate.regenerateOnStartup.description', 'Generate new certificate on each application startup')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.serverCertificate?.regenerateOnStartup ?? false}
                onChange={(e) => {
                  if (!loginEnabled) return;
                  setSettings({
                    ...settings,
                    serverCertificate: { ...settings.serverCertificate, regenerateOnStartup: e.target.checked }
                  });
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('serverCertificate.regenerateOnStartup')} />
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
