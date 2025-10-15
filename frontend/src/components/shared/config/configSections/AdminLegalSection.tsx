import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Button, Stack, Paper, Text, Loader, Group } from '@mantine/core';
import { alert } from '../../../toast';

interface LegalSettingsData {
  termsAndConditions?: string;
  privacyPolicy?: string;
  accessibilityStatement?: string;
  cookiePolicy?: string;
  impressum?: string;
}

export default function AdminLegalSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<LegalSettingsData>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/v1/admin/settings/section/legal');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch legal settings:', error);
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
      const response = await fetch('/api/v1/admin/settings/section/legal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
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
        <Text fw={600} size="lg">{t('admin.settings.legal.title', 'Legal Documents')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.legal.description', 'Configure links to legal documents and policies.')}
        </Text>
      </div>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <TextInput
              label={t('admin.settings.legal.termsAndConditions', 'Terms and Conditions')}
              description={t('admin.settings.legal.termsAndConditions.description', 'URL or filename to terms and conditions')}
              value={settings.termsAndConditions || ''}
              onChange={(e) => setSettings({ ...settings, termsAndConditions: e.target.value })}
              placeholder="https://example.com/terms"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.legal.privacyPolicy', 'Privacy Policy')}
              description={t('admin.settings.legal.privacyPolicy.description', 'URL or filename to privacy policy')}
              value={settings.privacyPolicy || ''}
              onChange={(e) => setSettings({ ...settings, privacyPolicy: e.target.value })}
              placeholder="https://example.com/privacy"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.legal.accessibilityStatement', 'Accessibility Statement')}
              description={t('admin.settings.legal.accessibilityStatement.description', 'URL or filename to accessibility statement')}
              value={settings.accessibilityStatement || ''}
              onChange={(e) => setSettings({ ...settings, accessibilityStatement: e.target.value })}
              placeholder="https://example.com/accessibility"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.legal.cookiePolicy', 'Cookie Policy')}
              description={t('admin.settings.legal.cookiePolicy.description', 'URL or filename to cookie policy')}
              value={settings.cookiePolicy || ''}
              onChange={(e) => setSettings({ ...settings, cookiePolicy: e.target.value })}
              placeholder="https://example.com/cookies"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.legal.impressum', 'Impressum')}
              description={t('admin.settings.legal.impressum.description', 'URL or filename to impressum (required in some jurisdictions)')}
              value={settings.impressum || ''}
              onChange={(e) => setSettings({ ...settings, impressum: e.target.value })}
              placeholder="https://example.com/impressum"
            />
          </div>
        </Stack>
      </Paper>

      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} size="sm">
          {t('admin.settings.save', 'Save Changes')}
        </Button>
      </Group>
    </Stack>
  );
}
