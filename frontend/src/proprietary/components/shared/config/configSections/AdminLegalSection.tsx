import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Button, Stack, Paper, Text, Loader, Group, Alert } from '@mantine/core';
import WarningIcon from '@mui/icons-material/Warning';
import { alert } from '@app/components/toast';
import RestartConfirmationModal from '@app/components/shared/config/RestartConfirmationModal';
import { useRestartServer } from '@app/components/shared/config/useRestartServer';
import { useAdminSettings } from '@app/hooks/useAdminSettings';
import PendingBadge from '@app/components/shared/config/PendingBadge';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';

interface LegalSettingsData {
  termsAndConditions?: string;
  privacyPolicy?: string;
  accessibilityStatement?: string;
  cookiePolicy?: string;
  impressum?: string;
}

export default function AdminLegalSection() {
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
  } = useAdminSettings<LegalSettingsData>({
    sectionName: 'legal',
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
        <Text fw={600} size="lg">{t('admin.settings.legal.title', 'Legal Documents')}</Text>
        <Text size="sm" c="dimmed">
          {t('admin.settings.legal.description', 'Configure links to legal documents and policies.')}
        </Text>
      </div>

      {/* Legal Disclaimer */}
      <Alert
        icon={<WarningIcon style={{ fontSize: 18 }} />}
        title={t('admin.settings.legal.disclaimer.title', 'Legal Responsibility Warning')}
        color="yellow"
        variant="light"
      >
        <Text size="sm">
          {t(
            'admin.settings.legal.disclaimer.message',
            'By customizing these legal documents, you assume full responsibility for ensuring compliance with all applicable laws and regulations, including but not limited to GDPR and other EU data protection requirements. Only modify these settings if: (1) you are operating a personal/private instance, (2) you are outside EU jurisdiction and understand your local legal obligations, or (3) you have obtained proper legal counsel and accept sole responsibility for all user data and legal compliance. Stirling-PDF and its developers assume no liability for your legal obligations.'
          )}
        </Text>
      </Alert>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.legal.termsAndConditions.label', 'Terms and Conditions')}</span>
                  <PendingBadge show={isFieldPending('termsAndConditions')} />
                </Group>
              }
              description={t('admin.settings.legal.termsAndConditions.description', 'URL or filename to terms and conditions')}
              value={settings.termsAndConditions || ''}
              onChange={(e) => setSettings({ ...settings, termsAndConditions: e.target.value })}
              placeholder="https://example.com/terms"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.legal.privacyPolicy.label', 'Privacy Policy')}</span>
                  <PendingBadge show={isFieldPending('privacyPolicy')} />
                </Group>
              }
              description={t('admin.settings.legal.privacyPolicy.description', 'URL or filename to privacy policy')}
              value={settings.privacyPolicy || ''}
              onChange={(e) => setSettings({ ...settings, privacyPolicy: e.target.value })}
              placeholder="https://example.com/privacy"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.legal.accessibilityStatement.label', 'Accessibility Statement')}</span>
                  <PendingBadge show={isFieldPending('accessibilityStatement')} />
                </Group>
              }
              description={t('admin.settings.legal.accessibilityStatement.description', 'URL or filename to accessibility statement')}
              value={settings.accessibilityStatement || ''}
              onChange={(e) => setSettings({ ...settings, accessibilityStatement: e.target.value })}
              placeholder="https://example.com/accessibility"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.legal.cookiePolicy.label', 'Cookie Policy')}</span>
                  <PendingBadge show={isFieldPending('cookiePolicy')} />
                </Group>
              }
              description={t('admin.settings.legal.cookiePolicy.description', 'URL or filename to cookie policy')}
              value={settings.cookiePolicy || ''}
              onChange={(e) => setSettings({ ...settings, cookiePolicy: e.target.value })}
              placeholder="https://example.com/cookies"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>{t('admin.settings.legal.impressum.label', 'Impressum')}</span>
                  <PendingBadge show={isFieldPending('impressum')} />
                </Group>
              }
              description={t('admin.settings.legal.impressum.description', 'URL or filename to impressum (required in some jurisdictions)')}
              value={settings.impressum || ''}
              onChange={(e) => setSettings({ ...settings, impressum: e.target.value })}
              placeholder="https://example.com/impressum"
              disabled={!loginEnabled}
            />
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
