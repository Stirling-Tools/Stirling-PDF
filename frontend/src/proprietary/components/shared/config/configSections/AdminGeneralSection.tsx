import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Switch, Button, Stack, Paper, Text, Loader, Group, MultiSelect, Badge, SegmentedControl } from '@mantine/core';
import { alert } from '@app/components/toast';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import apiClient from '@app/services/apiClient';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useUnsavedChanges } from '@app/contexts/UnsavedChangesContext';

interface GeneralSettingsData {
  ui: {
    appNameNavbar?: string;
    languages?: string[];
    logoStyle?: 'modern' | 'classic';
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
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();
  const { preferences, updatePreference } = usePreferences();
  const { setIsDirty, markClean } = useUnsavedChanges();
  
  // Track original settings for dirty detection
  const [originalSettingsSnapshot, setOriginalSettingsSnapshot] = useState<string>('');
  const [isDirty, setLocalIsDirty] = useState(false);
  const isInitialLoad = useRef(true);
  const justSavedRef = useRef(false);

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
        'ui.appNameNavbar': settings.ui?.appNameNavbar,
        'ui.languages': settings.ui?.languages,
        'ui.logoStyle': settings.ui?.logoStyle,
        // System settings
        'system.defaultLocale': settings.system?.defaultLocale,
        'system.showUpdate': settings.system?.showUpdate,
        'system.showUpdateOnlyAdmin': settings.system?.showUpdateOnlyAdmin,
        'system.customHTMLFiles': settings.system?.customHTMLFiles,
        'system.fileUploadLimit': settings.system?.fileUploadLimit,
        // Premium custom metadata
        'premium.proFeatures.customMetadata.autoUpdateMetadata': settings.customMetadata?.autoUpdateMetadata,
        'premium.proFeatures.customMetadata.author': settings.customMetadata?.author,
        'premium.proFeatures.customMetadata.creator': settings.customMetadata?.creator,
        'premium.proFeatures.customMetadata.producer': settings.customMetadata?.producer
      };

      if (settings.customPaths) {
        deltaSettings['system.customPaths.pipeline.watchedFoldersDir'] = settings.customPaths?.pipeline?.watchedFoldersDir;
        deltaSettings['system.customPaths.pipeline.finishedFoldersDir'] = settings.customPaths?.pipeline?.finishedFoldersDir;
        deltaSettings['system.customPaths.operations.weasyprint'] = settings.customPaths?.operations?.weasyprint;
        deltaSettings['system.customPaths.operations.unoconvert'] = settings.customPaths?.operations?.unoconvert;
      }

      return {
        sectionData: {},
        deltaSettings
      };
    }
  });

  useEffect(() => {
    // Only fetch real settings if login is enabled
    if (loginEnabled) {
      fetchSettings();
    }
  }, [loginEnabled, fetchSettings]);

  // Snapshot original settings after initial load OR after successful save (when refetch completes)
  useEffect(() => {
    if (loading || Object.keys(settings).length === 0) return;
    
    // After initial load: set snapshot and sync preference
    if (isInitialLoad.current) {
      setOriginalSettingsSnapshot(JSON.stringify(settings));
      
      // Sync local preference with server setting on initial load to ensure they're in sync
      // This ensures localStorage always reflects the server's authoritative value
      if (loginEnabled && settings.ui?.logoStyle) {
        updatePreference('logoVariant', settings.ui.logoStyle);
      }
      
      isInitialLoad.current = false;
      return;
    }
    
    // After save: update snapshot to new server state so dirty tracking is accurate
    if (justSavedRef.current) {
      setOriginalSettingsSnapshot(JSON.stringify(settings));
      setLocalIsDirty(false);
      setIsDirty(false);
      justSavedRef.current = false;
    }
  }, [loading, settings, loginEnabled, updatePreference, setIsDirty]);

  // Track dirty state by comparing current settings to snapshot
  useEffect(() => {
    if (!originalSettingsSnapshot || loading) return;
    
    const currentSnapshot = JSON.stringify(settings);
    const dirty = currentSnapshot !== originalSettingsSnapshot;
    setLocalIsDirty(dirty);
    setIsDirty(dirty);
  }, [settings, originalSettingsSnapshot, loading, setIsDirty]);

  // Clean up dirty state on unmount
  useEffect(() => {
    return () => {
      setIsDirty(false);
    };
  }, [setIsDirty]);

  const handleDiscard = useCallback(() => {
    if (originalSettingsSnapshot) {
      try {
        const original = JSON.parse(originalSettingsSnapshot);
        setSettings(original);
        setLocalIsDirty(false);
        setIsDirty(false);
      } catch (e) {
        console.error('Failed to parse original settings:', e);
      }
    }
  }, [originalSettingsSnapshot, setSettings, setIsDirty]);

  // Override loading state when login is disabled
  const actualLoading = loginEnabled ? loading : false;

  // Show the server setting when loaded (for admin config), otherwise show user's preference
  // Note: User's preference in localStorage is separate and takes precedence in the app via useLogoVariant hook
  const logoStyleValue = loginEnabled 
    ? (settings.ui?.logoStyle ?? preferences.logoVariant ?? 'classic')
    : (preferences.logoVariant ?? 'classic');

  const handleLogoStyleChange = (value: string) => {
    const nextValue = value === 'modern' ? 'modern' : 'classic';
    
    // Only update local settings state - don't update the actual preference until save
    // When login is disabled, update preference immediately since there's no server to save to
    if (!loginEnabled) {
      updatePreference('logoVariant', nextValue);
      return;
    }

    setSettings({
      ...settings,
      ui: {
        ...settings.ui,
        logoStyle: nextValue,
      }
    });
  };

  const handleSave = async () => {
    // Block save if login is disabled
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      // Mark that we just saved - the snapshot will be updated when refetch completes
      justSavedRef.current = true;
      
      await saveSettings();
      
      // Update local preference after successful save so the app reflects the saved logo style
      if (settings.ui?.logoStyle) {
        updatePreference('logoVariant', settings.ui.logoStyle);
      }
      
      // Clear dirty state immediately (snapshot will be updated by effect when refetch completes)
      setLocalIsDirty(false);
      markClean();
      showRestartModal();
    } catch (_error) {
      justSavedRef.current = false;
      alert({
        alertType: 'error',
        title: t('admin.error', 'Error'),
        body: t('admin.settings.saveError', 'Failed to save settings'),
      });
    }
  };

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <LoginRequiredBanner show={!loginEnabled} />

      <div>
        <Text fw={600} size="lg">{t('admin.settings.general.title', 'System Settings')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.general.description', 'Configure system-wide application settings including branding and default behaviour.')}
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
                  <span>{t('admin.settings.general.appNameNavbar.label', 'Navbar Brand')}</span>
                  <PendingBadge show={isFieldPending('ui.appNameNavbar')} />
                </Group>
              }
              description={t('admin.settings.general.appNameNavbar.description', 'The name displayed in the navigation bar')}
              value={settings.ui?.appNameNavbar || ''}
              onChange={(e) => setSettings({ ...settings, ui: { ...settings.ui, appNameNavbar: e.target.value } })}
              placeholder="Stirling PDF"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <Text size="sm" fw={500} mb={4}>
              <Group gap="xs">
                <span>{t('admin.settings.general.logoStyle.label', 'Logo Style')}</span>
                <PendingBadge show={isFieldPending('ui.logoStyle')} />
              </Group>
            </Text>
            <Text size="xs" c="dimmed" mb="xs">
              {t('admin.settings.general.logoStyle.description', 'Choose between the modern minimalist logo or the classic S icon')}
            </Text>
            <SegmentedControl
              value={logoStyleValue}
              onChange={handleLogoStyleChange}
              data={[
                {
                  value: 'classic',
                  label: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                      <img
                        src="/classic-logo/favicon.ico"
                        alt="Classic logo"
                        style={{ width: '24px', height: '24px' }}
                      />
                      <span>{t('admin.settings.general.logoStyle.classic', 'Classic')}</span>
                    </div>
                  )
                },
                {
                  value: 'modern',
                  label: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                      <img
                        src="/modern-logo/StirlingPDFLogoNoTextLight.svg"
                        alt="Modern logo"
                        style={{ width: '24px', height: '24px' }}
                      />
                      <span>{t('admin.settings.general.logoStyle.modern', 'Modern')}</span>
                    </div>
                  )
                },
              ]}
            />
          </div>

          <div>
            <MultiSelect
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.languages.label', 'Available Languages')}</span>
                  <PendingBadge show={isFieldPending('ui.languages')} />
                </Group>
              }
              description={t('admin.settings.general.languages.description', 'Limit which languages are available (empty = all languages)')}
              value={settings.ui?.languages || []}
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
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.defaultLocale.label', 'Default Locale')}</span>
                  <PendingBadge show={isFieldPending('system.defaultLocale')} />
                </Group>
              }
              description={t('admin.settings.general.defaultLocale.description', 'The default language for new users (e.g., en_US, es_ES)')}
              value={ settings.system?.defaultLocale || ''}
              onChange={(e) => setSettings({ ...settings, system: { ...settings.system, defaultLocale: e.target.value } })}
              placeholder="en_US"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.fileUploadLimit.label', 'File Upload Limit')}</span>
                  <PendingBadge show={isFieldPending('system.fileUploadLimit')} />
                </Group>
              }
              description={t('admin.settings.general.fileUploadLimit.description', 'Maximum file upload size (e.g., 100MB, 1GB)')}
              value={ settings.system?.fileUploadLimit || ''}
              onChange={(e) => setSettings({ ...settings, system: { ...settings.system, fileUploadLimit: e.target.value } })}
              placeholder="100MB"
              disabled={!loginEnabled}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.showUpdate.label', 'Show Update Notifications')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.general.showUpdate.description', 'Display notifications when a new version is available')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={ settings.system?.showUpdate || false}
                onChange={(e) => setSettings({ ...settings, system: { ...settings.system, showUpdate: e.target.checked } })}
                disabled={!loginEnabled}
              />
              <PendingBadge show={isFieldPending('system.showUpdate')} />
            </Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.showUpdateOnlyAdmin.label', 'Show Updates to Admins Only')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.general.showUpdateOnlyAdmin.description', 'Restrict update notifications to admin users only')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={ settings.system?.showUpdateOnlyAdmin || false}
                onChange={(e) => setSettings({ ...settings, system: { ...settings.system, showUpdateOnlyAdmin: e.target.checked } })}
                disabled={!loginEnabled}
              />
              <PendingBadge show={isFieldPending('system.showUpdateOnlyAdmin')} />
            </Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.customHTMLFiles.label', 'Custom HTML Files')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.general.customHTMLFiles.description', 'Allow serving custom HTML files from the customFiles directory')}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings.system?.customHTMLFiles || false}
                onChange={(e) => setSettings({ ...settings, system: { ...settings.system, customHTMLFiles: e.target.checked } })}
                disabled={!loginEnabled}
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
            <Text fw={600} size="sm">{t('admin.settings.general.customMetadata.label', 'Custom Metadata')}</Text>
            <Badge color="yellow" size="sm">PRO</Badge>
          </Group>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.general.customMetadata.autoUpdate.label', 'Auto Update Metadata')}</Text>
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
                disabled={!loginEnabled}
              />
              <PendingBadge show={isFieldPending('customMetadata.autoUpdateMetadata')} />
            </Group>
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customMetadata.author.label', 'Default Author')}</span>
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
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customMetadata.creator.label', 'Default Creator')}</span>
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
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customMetadata.producer.label', 'Default Producer')}</span>
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
              disabled={!loginEnabled}
            />
          </div>
        </Stack>
      </Paper>

      {/* Custom Paths */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <Text fw={600} size="sm" mb="xs">{t('admin.settings.general.customPaths.label', 'Custom Paths')}</Text>
            <Text size="xs" c="dimmed">
              {t('admin.settings.general.customPaths.description', 'Configure custom file system paths for pipeline processing and external tools')}
            </Text>
          </div>

          <Text fw={500} size="sm" mt="xs">{t('admin.settings.general.customPaths.pipeline.label', 'Pipeline Directories')}</Text>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customPaths.pipeline.watchedFoldersDir.label', 'Watched Folders Directory')}</span>
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
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customPaths.pipeline.finishedFoldersDir.label', 'Finished Folders Directory')}</span>
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
              disabled={!loginEnabled}
            />
          </div>

          <Text fw={500} size="sm" mt="md">{t('admin.settings.general.customPaths.operations.label', 'External Tool Paths')}</Text>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customPaths.operations.weasyprint.label', 'WeasyPrint Executable')}</span>
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
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.general.customPaths.operations.unoconvert.label', 'Unoconvert Executable')}</span>
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
              disabled={!loginEnabled}
            />
          </div>
        </Stack>
      </Paper>

      </Stack>

      {/* Sticky Save Footer - only shows when there are changes */}
      {isDirty && loginEnabled && (
        <div className="settings-sticky-footer">
          <Group justify="space-between" w="100%">
            <Text size="sm" c="dimmed">
              {t('admin.settings.unsavedChanges.hint', 'You have unsaved changes')}
            </Text>
            <Group gap="sm">
              <Button variant="default" onClick={handleDiscard} size="sm">
                {t('admin.settings.discard', 'Discard')}
              </Button>
              <Button onClick={handleSave} loading={saving} size="sm">
                {t('admin.settings.save', 'Save Changes')}
              </Button>
            </Group>
          </Group>
        </div>
      )}

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </div>
  );
}
