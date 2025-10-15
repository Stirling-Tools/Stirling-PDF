import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, NumberInput, Switch, Button, Stack, Paper, Text, Loader, Group } from '@mantine/core';
import { alert } from '../../../toast';

interface PremiumSettingsData {
  key?: string;
  enabled?: boolean;
  proFeatures?: {
    SSOAutoLogin?: boolean;
    CustomMetadata?: {
      autoUpdateMetadata?: boolean;
      author?: string;
      creator?: string;
      producer?: string;
    };
  };
  enterpriseFeatures?: {
    audit?: {
      enabled?: boolean;
      level?: number;
      retentionDays?: number;
    };
  };
}

export default function AdminPremiumSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PremiumSettingsData>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/v1/admin/settings/section/premium');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch premium settings:', error);
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
      const response = await fetch('/api/v1/admin/settings/section/premium', {
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
        <Text fw={600} size="lg">{t('admin.settings.premium.title', 'Premium & Enterprise')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.premium.description', 'Configure premium and enterprise features.')}
        </Text>
      </div>

      {/* License */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.premium.license', 'License')}</Text>

          <div>
            <TextInput
              label={t('admin.settings.premium.key', 'License Key')}
              description={t('admin.settings.premium.key.description', 'Enter your premium or enterprise license key')}
              value={settings.key || ''}
              onChange={(e) => setSettings({ ...settings, key: e.target.value })}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.premium.enabled', 'Enable Premium Features')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.premium.enabled.description', 'Enable license key checks for pro/enterprise features')}
              </Text>
            </div>
            <Switch
              checked={settings.enabled || false}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
          </div>
        </Stack>
      </Paper>

      {/* Pro Features */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.premium.proFeatures', 'Pro Features')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.premium.ssoAutoLogin', 'SSO Auto Login')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.premium.ssoAutoLogin.description', 'Automatically redirect to SSO login')}
              </Text>
            </div>
            <Switch
              checked={settings.proFeatures?.SSOAutoLogin || false}
              onChange={(e) => setSettings({
                ...settings,
                proFeatures: { ...settings.proFeatures, SSOAutoLogin: e.target.checked }
              })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.premium.customMetadata.autoUpdate', 'Auto Update Metadata')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.premium.customMetadata.autoUpdate.description', 'Automatically update PDF metadata')}
              </Text>
            </div>
            <Switch
              checked={settings.proFeatures?.CustomMetadata?.autoUpdateMetadata || false}
              onChange={(e) => setSettings({
                ...settings,
                proFeatures: {
                  ...settings.proFeatures,
                  CustomMetadata: {
                    ...settings.proFeatures?.CustomMetadata,
                    autoUpdateMetadata: e.target.checked
                  }
                }
              })}
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.premium.customMetadata.author', 'Default Author')}
              description={t('admin.settings.premium.customMetadata.author.description', 'Default author for PDF metadata')}
              value={settings.proFeatures?.CustomMetadata?.author || ''}
              onChange={(e) => setSettings({
                ...settings,
                proFeatures: {
                  ...settings.proFeatures,
                  CustomMetadata: {
                    ...settings.proFeatures?.CustomMetadata,
                    author: e.target.value
                  }
                }
              })}
              placeholder="username"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.premium.customMetadata.creator', 'Default Creator')}
              description={t('admin.settings.premium.customMetadata.creator.description', 'Default creator for PDF metadata')}
              value={settings.proFeatures?.CustomMetadata?.creator || ''}
              onChange={(e) => setSettings({
                ...settings,
                proFeatures: {
                  ...settings.proFeatures,
                  CustomMetadata: {
                    ...settings.proFeatures?.CustomMetadata,
                    creator: e.target.value
                  }
                }
              })}
              placeholder="Stirling-PDF"
            />
          </div>

          <div>
            <TextInput
              label={t('admin.settings.premium.customMetadata.producer', 'Default Producer')}
              description={t('admin.settings.premium.customMetadata.producer.description', 'Default producer for PDF metadata')}
              value={settings.proFeatures?.CustomMetadata?.producer || ''}
              onChange={(e) => setSettings({
                ...settings,
                proFeatures: {
                  ...settings.proFeatures,
                  CustomMetadata: {
                    ...settings.proFeatures?.CustomMetadata,
                    producer: e.target.value
                  }
                }
              })}
              placeholder="Stirling-PDF"
            />
          </div>
        </Stack>
      </Paper>

      {/* Enterprise Features */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">{t('admin.settings.premium.enterpriseFeatures', 'Enterprise Features')}</Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text fw={500} size="sm">{t('admin.settings.premium.audit.enabled', 'Enable Audit Logging')}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('admin.settings.premium.audit.enabled.description', 'Track user actions and system events')}
              </Text>
            </div>
            <Switch
              checked={settings.enterpriseFeatures?.audit?.enabled || false}
              onChange={(e) => setSettings({
                ...settings,
                enterpriseFeatures: {
                  ...settings.enterpriseFeatures,
                  audit: {
                    ...settings.enterpriseFeatures?.audit,
                    enabled: e.target.checked
                  }
                }
              })}
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.premium.audit.level', 'Audit Level')}
              description={t('admin.settings.premium.audit.level.description', '0=OFF, 1=BASIC, 2=STANDARD, 3=VERBOSE')}
              value={settings.enterpriseFeatures?.audit?.level || 2}
              onChange={(value) => setSettings({
                ...settings,
                enterpriseFeatures: {
                  ...settings.enterpriseFeatures,
                  audit: {
                    ...settings.enterpriseFeatures?.audit,
                    level: Number(value)
                  }
                }
              })}
              min={0}
              max={3}
            />
          </div>

          <div>
            <NumberInput
              label={t('admin.settings.premium.audit.retentionDays', 'Audit Retention (days)')}
              description={t('admin.settings.premium.audit.retentionDays.description', 'Number of days to retain audit logs')}
              value={settings.enterpriseFeatures?.audit?.retentionDays || 90}
              onChange={(value) => setSettings({
                ...settings,
                enterpriseFeatures: {
                  ...settings.enterpriseFeatures,
                  audit: {
                    ...settings.enterpriseFeatures?.audit,
                    retentionDays: Number(value)
                  }
                }
              })}
              min={1}
              max={3650}
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
