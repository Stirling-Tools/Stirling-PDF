import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Switch, Button, Stack, Paper, Text, Loader, Group, Alert, List } from '@mantine/core';
import { alert } from '@app/components/toast';
import LocalIcon from '@app/components/shared/LocalIcon';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';

interface PremiumSettingsData {
  key?: string;
  enabled?: boolean;
}

export default function AdminPremiumSection() {
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
  } = useAdminSettings<PremiumSettingsData>({
    sectionName: 'premium',
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
        <List mt="xs" size="sm">
          <List.Item><Text size="sm" component="span"><strong>SSO Auto Login</strong> (PRO) - Connections</Text></List.Item>
          <List.Item><Text size="sm" component="span"><strong>Custom Metadata</strong> (PRO) - General</Text></List.Item>
          <List.Item><Text size="sm" component="span"><strong>Audit Logging</strong> (ENTERPRISE) - Security</Text></List.Item>
          <List.Item><Text size="sm" component="span"><strong>Database Configuration</strong> (ENTERPRISE) - Database</Text></List.Item>
        </List>
      </Alert>

      {/* License Configuration */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.premium.license', 'License Configuration')}</Text>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.premium.key.label', 'License Key')}</span>
                  <PendingBadge show={isFieldPending('key')} />
                </Group>
              }
              description={t('admin.settings.premium.key.description', 'Enter your premium or enterprise license key')}
              value={settings.key || ''}
              onChange={(e) => setSettings({ ...settings, key: e.target.value })}
              placeholder="00000000-0000-0000-0000-000000000000"
              disabled={!loginEnabled}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.premium.enabled.label', 'Enable Premium Features')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.premium.enabled.description', 'Enable license key checks for pro/enterprise features')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.enabled || false}
                onChange={(e) => {
                  if (!loginEnabled) return;
                  setSettings({ ...settings, enabled: e.target.checked });
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending('enabled')} />
            </Group>
          </div>
        </Stack>
      </Paper>

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
