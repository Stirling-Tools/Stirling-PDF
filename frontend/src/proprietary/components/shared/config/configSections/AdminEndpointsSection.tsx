import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Stack, Paper, Text, Loader, Group, MultiSelect } from '@mantine/core';
import { alert } from '@app/components/toast';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';

interface EndpointsSettingsData {
  toRemove?: string[];
  groupsToRemove?: string[];
}

export default function AdminEndpointsSection() {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<EndpointsSettingsData>({
    sectionName: 'endpoints',
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

  // Common endpoint examples
  const commonEndpoints = [
    'img-to-pdf',
    'pdf-to-img',
    'merge-pdfs',
    'split-pdf',
    'rotate-pdf',
    'compress-pdf',
    'extract-images',
    'extract-image-scans',
    'add-watermark',
    'remove-watermark',
    'add-password',
    'remove-password',
    'change-permissions',
    'ocr-pdf',
    'pdf-to-pdfa',
    'html-to-pdf',
    'url-to-pdf',
    'markdown-to-pdf',
    'get-info-on-pdf',
    'extract-pdf-metadata',
    'pdf-to-single-page',
    'crop',
    'auto-split-pdf',
    'sanitize-pdf',
    'add-page-numbers',
    'auto-rename',
    'scale-pages',
    'repair',
    'flatten',
    'remove-blanks',
    'compare-pdfs'
  ];

  // Common endpoint groups
  const commonGroups = [
    'Conversion',
    'Security',
    'Other',
    'Organize',
    'LibreOffice',
    'CLI',
    'Python',
    'OpenCV'
  ];

  return (
    <Stack gap="lg">
      <LoginRequiredBanner show={!loginEnabled} />

      <div>
        <Text fw={600} size="lg">{t('admin.settings.endpoints.title', 'API Endpoints')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.endpoints.description', 'Control which API endpoints and endpoint groups are available.')}
        </Text>
      </div>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.endpoints.management', 'Endpoint Management')}</Text>

          <div>
            <MultiSelect
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.endpoints.toRemove.label', 'Disabled Endpoints')}</span>
                  <PendingBadge show={isFieldPending('toRemove')} />
                </Group>
              }
              description={t('admin.settings.endpoints.toRemove.description', 'Select individual endpoints to disable')}
              value={settings.toRemove || []}
              onChange={(value) => {
                if (!loginEnabled) return;
                setSettings({ ...settings, toRemove: value });
              }}
              data={commonEndpoints.map(endpoint => ({ value: endpoint, label: endpoint }))}
              searchable
              clearable
              placeholder="Select endpoints to disable"
              comboboxProps={{ zIndex: 1400 }}
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <MultiSelect
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.endpoints.groupsToRemove.label', 'Disabled Endpoint Groups')}</span>
                  <PendingBadge show={isFieldPending('groupsToRemove')} />
                </Group>
              }
              description={t('admin.settings.endpoints.groupsToRemove.description', 'Select endpoint groups to disable')}
              value={settings.groupsToRemove || []}
              onChange={(value) => {
                if (!loginEnabled) return;
                setSettings({ ...settings, groupsToRemove: value });
              }}
              data={commonGroups.map(group => ({ value: group, label: group }))}
              searchable
              clearable
              placeholder="Select groups to disable"
              comboboxProps={{ zIndex: 1400 }}
              disabled={!loginEnabled}
            />
          </div>

          <Paper bg="var(--mantine-color-blue-light)" p="sm" radius="sm">
            <Text size="xs" c="dimmed">
              {t('admin.settings.endpoints.note', 'Note: Disabling endpoints restricts API access but does not remove UI components. Restart required for changes to take effect.')}
            </Text>
          </Paper>
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
