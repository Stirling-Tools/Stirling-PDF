import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Switch, Button, Stack, Paper, Text, Loader, Group, MultiSelect } from '@mantine/core';
import { alert } from '../../../toast';

interface GeneralSettingsData {
  ui: {
    appName?: string;
    homeDescription?: string;
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
}

export default function AdminGeneralSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const [uiResponse, systemResponse] = await Promise.all([
        fetch('/api/v1/admin/settings/section/ui'),
        fetch('/api/v1/admin/settings/section/system')
      ]);

      if (uiResponse.ok && systemResponse.ok) {
        const ui = await uiResponse.json();
        const system = await systemResponse.json();
        setSettings({ ui, system });
      }
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

      if (uiResponse.ok && systemResponse.ok) {
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
        <Text fw={600} size="lg">{t('admin.settings.general.title', 'General')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.general.description', 'Configure general application settings including branding and default behaviour.')}
        </Text>
      </div>

      {/* UI Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.general.ui', 'User Interface')}</Text>

          <div>
            <TextInput
              label={t('admin.settings.general.appName', 'Application Name')}
              description={t('admin.settings.general.appName.description', 'The name displayed in the browser tab and home page')}
              value={settings.ui.appName || ''}
              onChange={(e) => setSettings({ ...settings, ui: { ...settings.ui, appName: e.target.value } })}
              placeholder="Stirling PDF"
            />
          </div>

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
            <TextInput
              label={t('admin.settings.general.homeDescription', 'Home Description')}
              description={t('admin.settings.general.homeDescription.description', 'The description text shown on the home page')}
              value={settings.ui.homeDescription || ''}
              onChange={(e) => setSettings({ ...settings, ui: { ...settings.ui, homeDescription: e.target.value } })}
              placeholder="Your locally hosted one-stop-shop for all your PDF needs"
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
        </Stack>
      </Paper>

      {/* System Settings */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.general.system', 'System')}</Text>

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

      {/* Save Button */}
      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} size="sm">
          {t('admin.settings.save', 'Save Changes')}
        </Button>
      </Group>
    </Stack>
  );
}
