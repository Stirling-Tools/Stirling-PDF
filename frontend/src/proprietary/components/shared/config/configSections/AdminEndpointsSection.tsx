import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Stack, Paper, Text, Loader, Group, MultiSelect, Checkbox } from '@mantine/core';
import { alert } from '@app/components/toast';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';

interface UISettingsData {
  defaultHideUnavailableTools?: boolean;
  defaultHideUnavailableConversions?: boolean;
}

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

  const {
    settings: uiSettings,
    setSettings: setUiSettings,
    loading: uiLoading,
    saving: uiSaving,
    fetchSettings: fetchUiSettings,
    saveSettings: saveUiSettings,
    isFieldPending: isUiFieldPending,
  } = useAdminSettings<UISettingsData>({
    sectionName: 'ui',
  });

  useEffect(() => {
    if (loginEnabled) {
      fetchSettings();
      fetchUiSettings();
    }
  }, [loginEnabled, fetchSettings, fetchUiSettings]);

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

  const handleUiSave = async () => {
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      await saveUiSettings();
      alert({
        alertType: 'success',
        title: t('admin.success', 'Success'),
        body: t('admin.settings.saveSuccess', 'Settings saved successfully. Restart required for changes to take effect.'),
      });
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  // Override loading state when login is disabled
  const actualLoading = loginEnabled ? (loading || uiLoading) : false;

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  // Complete list of all endpoints from frontend tool registry (alphabetical)
  const commonEndpoints = [
    'add-attachments',
    'add-image',
    'add-page-numbers',
    'add-password',
    'add-stamp',
    'add-watermark',
    'adjust-contrast',
    'auto-redact',
    'auto-rename',
    'auto-split-pdf',
    'automate',
    'booklet-imposition',
    'cert-sign',
    'compare',
    'compress-pdf',
    'crop',
    'dev-airgapped-docs',
    'dev-api-docs',
    'dev-folder-scanning-docs',
    'dev-sso-guide-docs',
    'edit-table-of-contents',
    'eml-to-pdf',
    'extract-image-scans',
    'extract-images',
    'file-to-pdf',
    'flatten',
    'get-info-on-pdf',
    'handleData',
    'html-to-pdf',
    'img-to-pdf',
    'markdown-to-pdf',
    'merge-pdfs',
    'multi-page-layout',
    'multi-tool',
    'ocr-pdf',
    'overlay-pdf',
    'pdf-to-csv',
    'pdf-to-epub',
    'pdf-to-html',
    'pdf-to-img',
    'pdf-to-markdown',
    'pdf-to-pdfa',
    'pdf-to-presentation',
    'pdf-to-single-page',
    'pdf-to-text',
    'pdf-to-word',
    'pdf-to-xml',
    'pipeline',
    'rearrange-pages',
    'remove-annotations',
    'remove-blanks',
    'remove-cert-sign',
    'remove-image-pdf',
    'remove-pages',
    'remove-password',
    'repair',
    'replace-invert-pdf',
    'rotate-pdf',
    'sanitize-pdf',
    'scale-pages',
    'scanner-effect',
    'show-javascript',
    'sign',
    'split-by-size-or-count',
    'split-pages',
    'split-pdf-by-chapters',
    'split-pdf-by-sections',
    'text-editor-pdf',
    'unlock-pdf-forms',
    'update-metadata',
    'validate-signature',
    'view-pdf',
  ];

  // Complete list of functional and tool groups from EndpointConfiguration.java
  const commonGroups = [
    // Functional Groups
    'PageOps',
    'Convert',
    'Security',
    'Other',
    'Advance',
    'Automation',
    'DeveloperTools',
    'DeveloperDocs',
    // Tool Groups
    'CLI',
    'Python',
    'OpenCV',
    'LibreOffice',
    'Unoconvert',
    'Java',
    'Javascript',
    'qpdf',
    'Ghostscript',
    'ImageMagick',
    'tesseract',
    'OCRmyPDF',
    'Weasyprint',
    'Pdftohtml',
    'Calibre',
    'FFmpeg',
    'veraPDF',
    'rar',
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
          {t('admin.settings.save', 'Save Endpoint Settings')}
        </Button>
      </Group>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <Text fw={600} size="sm" mb="xs">{t('admin.settings.endpoints.userDefaults', 'User Preference Defaults')}</Text>
            <Text size="xs" c="dimmed">
              {t('admin.settings.endpoints.userDefaultsDescription', 'Set default values for user preferences. Users can override these in their personal settings.')}
            </Text>
          </div>

          <Checkbox
            label={
              <Group gap="xs">
                <span>{t('admin.settings.endpoints.defaultHideUnavailableTools.label', 'Hide unavailable tools by default')}</span>
                <PendingBadge show={isUiFieldPending('defaultHideUnavailableTools')} />
              </Group>
            }
            description={t('admin.settings.endpoints.defaultHideUnavailableTools.description', 'Remove disabled tools instead of showing them greyed out')}
            checked={uiSettings.defaultHideUnavailableTools || false}
            onChange={(e) => {
              if (!loginEnabled) return;
              setUiSettings({ ...uiSettings, defaultHideUnavailableTools: e.currentTarget.checked });
            }}
            disabled={!loginEnabled}
          />

          <Checkbox
            label={
              <Group gap="xs">
                <span>{t('admin.settings.endpoints.defaultHideUnavailableConversions.label', 'Hide unavailable conversions by default')}</span>
                <PendingBadge show={isUiFieldPending('defaultHideUnavailableConversions')} />
              </Group>
            }
            description={t('admin.settings.endpoints.defaultHideUnavailableConversions.description', 'Remove disabled conversion options instead of showing them greyed out')}
            checked={uiSettings.defaultHideUnavailableConversions || false}
            onChange={(e) => {
              if (!loginEnabled) return;
              setUiSettings({ ...uiSettings, defaultHideUnavailableConversions: e.currentTarget.checked });
            }}
            disabled={!loginEnabled}
          />
        </Stack>
      </Paper>

      <Group justify="flex-end">
        <Button onClick={handleUiSave} loading={uiSaving} size="sm" disabled={!loginEnabled}>
          {t('admin.settings.save', 'Save User Defaults')}
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
