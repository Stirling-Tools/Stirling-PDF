import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Switch, Button, Stack, Paper, Text, Loader, Group, MultiSelect, Badge } from '@mantine/core';
import { alert } from '../../../toast';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';

interface GeneralSettingsData {
  ui: {
    appNameNavbar?: string;
    languages?: string[];
  };
  system: {
    defaultLocale?: string;
    showUpdate?: boolean;
    showUpdateOnlyAdmin?: boolean;
    customHTMLFiles?: boolean;
    fileUploadLimit?: string;
  };
  customPaths?: {
    pipeline?: {
      watchedFoldersDir?: string;
      finishedFoldersDir?: string;
    };
    operations?: {
      weasyprint?: string;
      unoconvert?: string;
    };
  };
  customMetadata?: {
    autoUpdateMetadata?: boolean;
    author?: string;
    creator?: string;
    producer?: string;
  };
}

export default function AdminGeneralSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();
  const [settings, setSettings] = useState<GeneralSettingsData>({
    ui: {},
    system: {},
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      // Fetch both ui and system sections from proprietary admin API
      const [uiResponse, systemResponse, premiumResponse] = await Promise.all([
        fetch('/api/v1/admin/settings/section/ui'),
        fetch('/api/v1/admin/settings/section/system'),
        fetch('/api/v1/admin/settings/section/premium')
      ]);

      const ui = uiResponse.ok ? await uiResponse.json() : {};
      const system = systemResponse.ok ? await systemResponse.json() : {};
      const premium = premiumResponse.ok ? await premiumResponse.json() : {};

      setSettings({
        ui,
        system,
        customPaths: system.customPaths || {
          pipeline: {
            watchedFoldersDir: '',
            finishedFoldersDir: ''
          },
          operations: {
            weasyprint: '',
            unoconvert: ''
          }
        },
        customMetadata: premium.proFeatures?.customMetadata || {
          autoUpdateMetadata: false,
          author: '',
          creator: '',
          producer: ''
        }
      });
    } catch (error) {
      console.error('Failed to fetch general settings:', error);
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
      // Save both ui and system sections separately using proprietary admin API
      const [uiResponse, systemResponse] = await Promise.all([
        fetch('/api/v1/admin/settings/section/ui', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings.ui),
        }),
        fetch('/api/v1/admin/settings/section/system', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings.system),
        })
      ]);

      // Save custom metadata and custom paths via delta endpoint
      const deltaSettings: Record<string, any> = {
        'premium.proFeatures.customMetadata.autoUpdateMetadata': settings.customMetadata?.autoUpdateMetadata,
        'premium.proFeatures.customMetadata.author': settings.customMetadata?.author,
        'premium.proFeatures.customMetadata.creator': settings.customMetadata?.creator,
        'premium.proFeatures.customMetadata.producer': settings.customMetadata?.producer
      };

      // Add custom paths settings
      if (settings.customPaths) {
        deltaSettings['system.customPaths.pipeline.watchedFoldersDir'] = settings.customPaths.pipeline?.watchedFoldersDir;
        deltaSettings['system.customPaths.pipeline.finishedFoldersDir'] = settings.customPaths.pipeline?.finishedFoldersDir;
        deltaSettings['system.customPaths.operations.weasyprint'] = settings.customPaths.operations?.weasyprint;
        deltaSettings['system.customPaths.operations.unoconvert'] = settings.customPaths.operations?.unoconvert;
      }

      const deltaResponse = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: deltaSettings }),
      });

      if (uiResponse.ok && systemResponse.ok && deltaResponse.ok) {
        // Show restart confirmation modal
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
        <Text fw={600} size="lg">{t('admin.settings.general.title', 'General')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.general.description', 'Configure general application settings including branding and default behaviour.')}
        </Text>
      </div>

      {/* System Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.general.system', 'System')}</Text>

          <div>
            <TextInput
              label={t('admin.settings.general.appNameNavbar', 'Navbar Brand')}
              description={t('admin.settings.general.appNameNavbar.description', 'The name displayed in the navigation bar')}
              value={settings.ui.appNameNavbar || ''}
              onChange={(e) => setSettings({ ...settings, ui: { ...settings.ui, appNameNavbar: e.target.value } })}
              placeholder="Stirling PDF"
            />
          </div>

          <div>
            <MultiSelect
              label={t('admin.settings.general.languages', 'Available Languages')}
              description={t('admin.settings.general.languages.description', 'Limit which languages are available (empty = all languages)')}
              value={settings.ui.languages || []}
              onChange={(value) => setSettings({ ...settings, ui: { ...settings.ui, languages: value } })}
              data={[
                { value: 'de_DE', label: 'Deutsch' },
                { value: 'es_ES', label: 'Español' },
                { value: 'fr_FR', label: 'Français' },
                { value: 'it_IT', label: 'Italiano' },
                { value: 'pl_PL', label: 'Polski' },
                { value: 'pt_BR', label: 'Português (Brasil)' },
                { value: 'ru_RU', label: 'Русский' },
                { value: 'zh_CN', label: '简体中文' },
                { value: 'ja_JP', label: '日本語' },
                { value: 'ko_KR', label: '한국어' },
              ]}
              searchable
              clearable
              placeholder="Select languages"
              comboboxProps={{ zIndex: 1400 }}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.general.defaultLocale', 'Default Locale')}
              description={t('admin.settings.general.defaultLocale.description', 'The default language for new users (e.g., en_US, es_ES)')}
              value={settings.system.defaultLocale || ''}
              onChange={(e) => setSettings({ ...settings, system: { ...settings.system, defaultLocale: e.target.value } })}
              placeholder="en_US"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.general.fileUploadLimit', 'File Upload Limit')}
              description={t('admin.settings.general.fileUploadLimit.description', 'Maximum file upload size (e.g., 100MB, 1GB)')}
              value={settings.system.fileUploadLimit || ''}
              onChange={(e) => setSettings({ ...settings, system: { ...settings.system, fileUploadLimit: e.target.value } })}
              placeholder="100MB"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.showUpdate', 'Show Update Notifications')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.general.showUpdate.description', 'Display notifications when a new version is available')}
              </Text>
            </div>
            <Switch
              checked={settings.system.showUpdate || false}
              onChange={(e) => setSettings({ ...settings, system: { ...settings.system, showUpdate: e.target.checked } })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.showUpdateOnlyAdmin', 'Show Updates to Admins Only')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.general.showUpdateOnlyAdmin.description', 'Restrict update notifications to admin users only')}
              </Text>
            </div>
            <Switch
              checked={settings.system.showUpdateOnlyAdmin || false}
              onChange={(e) => setSettings({ ...settings, system: { ...settings.system, showUpdateOnlyAdmin: e.target.checked } })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.customHTMLFiles', 'Custom HTML Files')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.general.customHTMLFiles.description', 'Allow serving custom HTML files from the customFiles directory')}
              </Text>
            </div>
            <Switch
              checked={settings.system.customHTMLFiles || false}
              onChange={(e) => setSettings({ ...settings, system: { ...settings.system, customHTMLFiles: e.target.checked } })}
            />
          </div>
        </Stack>
      </Paper>

      {/* Custom Metadata - Premium Feature */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">{t('admin.settings.general.customMetadata', 'Custom Metadata')}</Text>
            <Badge color="yellow" size="sm">PRO</Badge>
          </Group>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.customMetadata.autoUpdate', 'Auto Update Metadata')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.general.customMetadata.autoUpdate.description', 'Automatically update PDF metadata on all processed documents')}
              </Text>
            </div>
            <Switch
              checked={settings.customMetadata?.autoUpdateMetadata || false}
              onChange={(e) => setSettings({
                ...settings,
                customMetadata: {
                  ...settings.customMetadata,
                  autoUpdateMetadata: e.target.checked
                }
              })}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.general.customMetadata.author', 'Default Author')}
              description={t('admin.settings.general.customMetadata.author.description', 'Default author for PDF metadata (e.g., username)')}
              value={settings.customMetadata?.author || ''}
              onChange={(e) => setSettings({
                ...settings,
                customMetadata: {
                  ...settings.customMetadata,
                  author: e.target.value
                }
              })}
              placeholder="username"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.general.customMetadata.creator', 'Default Creator')}
              description={t('admin.settings.general.customMetadata.creator.description', 'Default creator for PDF metadata')}
              value={settings.customMetadata?.creator || ''}
              onChange={(e) => setSettings({
                ...settings,
                customMetadata: {
                  ...settings.customMetadata,
                  creator: e.target.value
                }
              })}
              placeholder="Stirling-PDF"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.general.customMetadata.producer', 'Default Producer')}
              description={t('admin.settings.general.customMetadata.producer.description', 'Default producer for PDF metadata')}
              value={settings.customMetadata?.producer || ''}
              onChange={(e) => setSettings({
                ...settings,
                customMetadata: {
                  ...settings.customMetadata,
                  producer: e.target.value
                }
              })}
              placeholder="Stirling-PDF"
            />
          </div>
        </Stack>
      </Paper>

      {/* Custom Paths */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <Text fw={600} size="sm" mb="xs">{t('admin.settings.general.customPaths', 'Custom Paths')}</Text>
            <Text size="xs" c="dimmed">
              {t('admin.settings.general.customPaths.description', 'Configure custom file system paths for pipeline processing and external tools')}
            </Text>
          </div>

          <Text fw={500} size="sm" mt="xs">{t('admin.settings.general.customPaths.pipeline', 'Pipeline Directories')}</Text>

          <div>
            <TextInput
              label={t('admin.settings.general.customPaths.pipeline.watchedFoldersDir', 'Watched Folders Directory')}
              description={t('admin.settings.general.customPaths.pipeline.watchedFoldersDir.description', 'Directory where pipeline monitors for incoming PDFs (leave empty for default: /pipeline/watchedFolders)')}
              value={settings.customPaths?.pipeline?.watchedFoldersDir || ''}
              onChange={(e) => setSettings({
                ...settings,
                customPaths: {
                  ...settings.customPaths,
                  pipeline: {
                    ...settings.customPaths?.pipeline,
                    watchedFoldersDir: e.target.value
                  }
                }
              })}
              placeholder="/pipeline/watchedFolders"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.general.customPaths.pipeline.finishedFoldersDir', 'Finished Folders Directory')}
              description={t('admin.settings.general.customPaths.pipeline.finishedFoldersDir.description', 'Directory where processed PDFs are outputted (leave empty for default: /pipeline/finishedFolders)')}
              value={settings.customPaths?.pipeline?.finishedFoldersDir || ''}
              onChange={(e) => setSettings({
                ...settings,
                customPaths: {
                  ...settings.customPaths,
                  pipeline: {
                    ...settings.customPaths?.pipeline,
                    finishedFoldersDir: e.target.value
                  }
                }
              })}
              placeholder="/pipeline/finishedFolders"
            />
          </div>

          <Text fw={500} size="sm" mt="md">{t('admin.settings.general.customPaths.operations', 'External Tool Paths')}</Text>

          <div>
            <TextInput
              label={t('admin.settings.general.customPaths.operations.weasyprint', 'WeasyPrint Executable')}
              description={t('admin.settings.general.customPaths.operations.weasyprint.description', 'Path to WeasyPrint executable for HTML to PDF conversion (leave empty for default: /opt/venv/bin/weasyprint)')}
              value={settings.customPaths?.operations?.weasyprint || ''}
              onChange={(e) => setSettings({
                ...settings,
                customPaths: {
                  ...settings.customPaths,
                  operations: {
                    ...settings.customPaths?.operations,
                    weasyprint: e.target.value
                  }
                }
              })}
              placeholder="/opt/venv/bin/weasyprint"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.general.customPaths.operations.unoconvert', 'Unoconvert Executable')}
              description={t('admin.settings.general.customPaths.operations.unoconvert.description', 'Path to LibreOffice unoconvert for document conversions (leave empty for default: /opt/venv/bin/unoconvert)')}
              value={settings.customPaths?.operations?.unoconvert || ''}
              onChange={(e) => setSettings({
                ...settings,
                customPaths: {
                  ...settings.customPaths,
                  operations: {
                    ...settings.customPaths?.operations,
                    unoconvert: e.target.value
                  }
                }
              })}
              placeholder="/opt/venv/bin/unoconvert"
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
