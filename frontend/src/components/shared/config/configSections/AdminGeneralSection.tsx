import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Switch, Button, Stack, Paper, Text, Loader, Group, MultiSelect, Badge } from '@mantine/core';
import { alert } from '../../../toast';
import RestartConfirmationModal from '../RestartConfirmationModal';
import { useRestartServer } from '../useRestartServer';
import { useAdminSettings } from '../../../../hooks/useAdminSettings';
import PendingBadge from '../PendingBadge';
import apiClient from '../../../../services/apiClient';

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
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<GeneralSettingsData>({
    sectionName: 'general',
    fetchTransformer: async () => {
      const [uiResponse, systemResponse, premiumResponse] = await Promise.all([
        apiClient.get('/api/v1/admin/settings/section/ui'),
        apiClient.get('/api/v1/admin/settings/section/system'),
        apiClient.get('/api/v1/admin/settings/section/premium')
      ]);

      const ui = uiResponse.data || {};
      const system = systemResponse.data || {};
      const premium = premiumResponse.data || {};

      const result: any = {
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
      };

      // Merge pending blocks from all three endpoints
      const pendingBlock: any = {};
      if (ui._pending) {
        pendingBlock.ui = ui._pending;
      }
      if (system._pending) {
        pendingBlock.system = system._pending;
      }
      if (system._pending?.customPaths) {
        pendingBlock.customPaths = system._pending.customPaths;
      }
      if (premium._pending?.proFeatures?.customMetadata) {
        pendingBlock.customMetadata = premium._pending.proFeatures.customMetadata;
      }

      if (Object.keys(pendingBlock).length > 0) {
        result._pending = pendingBlock;
      }

      return result;
    },
    saveTransformer: (settings) => {
      const deltaSettings: Record<string, any> = {
        // UI settings
        'ui.appNameNavbar': settings.ui.appNameNavbar,
        'ui.languages': settings.ui.languages,
        // System settings
        'system.defaultLocale': settings.system.defaultLocale,
        'system.showUpdate': settings.system.showUpdate,
        'system.showUpdateOnlyAdmin': settings.system.showUpdateOnlyAdmin,
        'system.customHTMLFiles': settings.system.customHTMLFiles,
        'system.fileUploadLimit': settings.system.fileUploadLimit,
        // Premium custom metadata
        'premium.proFeatures.customMetadata.autoUpdateMetadata': settings.customMetadata?.autoUpdateMetadata,
        'premium.proFeatures.customMetadata.author': settings.customMetadata?.author,
        'premium.proFeatures.customMetadata.creator': settings.customMetadata?.creator,
        'premium.proFeatures.customMetadata.producer': settings.customMetadata?.producer
      };

      if (settings.customPaths) {
        deltaSettings['system.customPaths.pipeline.watchedFoldersDir'] = settings.customPaths.pipeline?.watchedFoldersDir;
        deltaSettings['system.customPaths.pipeline.finishedFoldersDir'] = settings.customPaths.pipeline?.finishedFoldersDir;
        deltaSettings['system.customPaths.operations.weasyprint'] = settings.customPaths.operations?.weasyprint;
        deltaSettings['system.customPaths.operations.unoconvert'] = settings.customPaths.operations?.unoconvert;
      }

      return {
        sectionData: {},
        deltaSettings
      };
    }
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      await saveSettings();
      showRestartModal();
    } catch (error) {
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
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
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.appNameNavbar', 'Navbar Brand')}</span>
                  <PendingBadge show={isFieldPending('ui.appNameNavbar')} />
                </Group>
              }
              description={t('admin.settings.general.appNameNavbar.description', 'The name displayed in the navigation bar')}
              value={settings.ui.appNameNavbar || ''}
              onChange={(e) => setSettings({ ...settings, ui: { ...settings.ui, appNameNavbar: e.target.value } })}
              placeholder="Stirling PDF"
            />
          </div>

          <div>
            <MultiSelect
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.languages', 'Available Languages')}</span>
                  <PendingBadge show={isFieldPending('ui.languages')} />
                </Group>
              }
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
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.defaultLocale', 'Default Locale')}</span>
                  <PendingBadge show={isFieldPending('system.defaultLocale')} />
                </Group>
              }
              description={t('admin.settings.general.defaultLocale.description', 'The default language for new users (e.g., en_US, es_ES)')}
              value={settings.system.defaultLocale || ''}
              onChange={(e) => setSettings({ ...settings, system: { ...settings.system, defaultLocale: e.target.value } })}
              placeholder="en_US"
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.fileUploadLimit', 'File Upload Limit')}</span>
                  <PendingBadge show={isFieldPending('system.fileUploadLimit')} />
                </Group>
              }
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
            <Group gap="xs">
              <Switch
                checked={settings.system.showUpdate || false}
                onChange={(e) => setSettings({ ...settings, system: { ...settings.system, showUpdate: e.target.checked } })}
              />
              <PendingBadge show={isFieldPending('system.showUpdate')} />
            </Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.showUpdateOnlyAdmin', 'Show Updates to Admins Only')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.general.showUpdateOnlyAdmin.description', 'Restrict update notifications to admin users only')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.system.showUpdateOnlyAdmin || false}
                onChange={(e) => setSettings({ ...settings, system: { ...settings.system, showUpdateOnlyAdmin: e.target.checked } })}
              />
              <PendingBadge show={isFieldPending('system.showUpdateOnlyAdmin')} />
            </Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.customHTMLFiles', 'Custom HTML Files')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.general.customHTMLFiles.description', 'Allow serving custom HTML files from the customFiles directory')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.system.customHTMLFiles || false}
                onChange={(e) => setSettings({ ...settings, system: { ...settings.system, customHTMLFiles: e.target.checked } })}
              />
              <PendingBadge show={isFieldPending('system.customHTMLFiles')} />
            </Group>
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
            <Group gap="xs">
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
              <PendingBadge show={isFieldPending('customMetadata.autoUpdateMetadata')} />
            </Group>
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customMetadata.author', 'Default Author')}</span>
                  <PendingBadge show={isFieldPending('customMetadata.author')} />
                </Group>
              }
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
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customMetadata.creator', 'Default Creator')}</span>
                  <PendingBadge show={isFieldPending('customMetadata.creator')} />
                </Group>
              }
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
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customMetadata.producer', 'Default Producer')}</span>
                  <PendingBadge show={isFieldPending('customMetadata.producer')} />
                </Group>
              }
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
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customPaths.pipeline.watchedFoldersDir', 'Watched Folders Directory')}</span>
                  <PendingBadge show={isFieldPending('customPaths.pipeline.watchedFoldersDir')} />
                </Group>
              }
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
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customPaths.pipeline.finishedFoldersDir', 'Finished Folders Directory')}</span>
                  <PendingBadge show={isFieldPending('customPaths.pipeline.finishedFoldersDir')} />
                </Group>
              }
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
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customPaths.operations.weasyprint', 'WeasyPrint Executable')}</span>
                  <PendingBadge show={isFieldPending('customPaths.operations.weasyprint')} />
                </Group>
              }
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
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customPaths.operations.unoconvert', 'Unoconvert Executable')}</span>
                  <PendingBadge show={isFieldPending('customPaths.operations.unoconvert')} />
                </Group>
              }
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
