import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  CloseButton,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
} from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { alert } from '@app/components/toast';
import { ChangeUserPasswordRequest, User, userManagementService } from '@app/services/userManagementService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

interface ChangeUserPasswordModalProps {
  opened: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
  mailEnabled: boolean;
}

function generateSecurePassword() {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789@$!%*?&';
  const length = 14;
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

export default function ChangeUserPasswordModal({ opened, onClose, user, onSuccess, mailEnabled }: ChangeUserPasswordModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    newPassword: '',
    generateRandom: false,
    sendEmail: mailEnabled,
    includePassword: true,
  });
  const [processing, setProcessing] = useState(false);

  const disabled = !user;

  const handleGeneratePassword = () => {
    const generated = generateSecurePassword();
    setForm((prev) => ({ ...prev, newPassword: generated, generateRandom: true }));
  };

  const resetState = () => {
    setForm({
      newPassword: '',
      generateRandom: false,
      sendEmail: mailEnabled,
      includePassword: true,
    });
  };

  const handleClose = () => {
    if (processing) return;
    resetState();
    onClose();
  };

  const handleSubmit = async () => {
    if (!user) return;

    if (!form.generateRandom && !form.newPassword.trim()) {
      alert({ alertType: 'error', title: t('workspace.people.changePassword.passwordRequired', 'Please enter a new password') });
      return;
    }

    const payload: ChangeUserPasswordRequest = {
      username: user.username,
      newPassword: form.generateRandom ? undefined : form.newPassword,
      generateRandom: form.generateRandom,
      sendEmail: mailEnabled && form.sendEmail,
      includePassword: mailEnabled && form.sendEmail && form.includePassword,
    };

    try {
      setProcessing(true);
      await userManagementService.changeUserPassword(payload);
      alert({ alertType: 'success', title: t('workspace.people.changePassword.success', 'Password updated successfully') });
      onSuccess();
      handleClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || t('workspace.people.changePassword.error', 'Failed to update password');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (opened) {
      setForm({
        newPassword: '',
        generateRandom: false,
        sendEmail: mailEnabled,
        includePassword: true,
      });
    }
  }, [opened, mailEnabled, user?.username]);

  const canEmail = mailEnabled && !!user?.email;
  const passwordPreview = useMemo(() => form.newPassword && form.generateRandom ? form.newPassword : '', [form.generateRandom, form.newPassword]);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="md"
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      centered
      padding="xl"
      withCloseButton={false}
    >
      <div style={{ position: 'relative' }}>
        <CloseButton
          onClick={handleClose}
          size="lg"
          disabled={processing}
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            zIndex: 1,
          }}
        />
        <Stack gap="lg" pt="md">
          <Stack gap="md" align="center">
            <LocalIcon icon="lock" width="3rem" height="3rem" style={{ color: 'var(--mantine-color-gray-6)' }} />
            <Text size="xl" fw={600} ta="center">
              {t('workspace.people.changePassword.title', 'Change password')}
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              {t('workspace.people.changePassword.subtitle', 'Update the password for')} <strong>{user?.username}</strong>
            </Text>
          </Stack>

          <Stack gap="sm">
            <PasswordInput
              label={t('workspace.people.changePassword.newPassword', 'New password')}
              placeholder={t('workspace.people.changePassword.placeholder', 'Enter a new password')}
              value={form.newPassword}
              onChange={(event) => setForm({ ...form, newPassword: event.currentTarget.value, generateRandom: false })}
              disabled={processing || disabled}
              data-autofocus
            />
            <Group justify="space-between">
              <Checkbox
                label={t('workspace.people.changePassword.generateRandom', 'Generate secure password')}
                checked={form.generateRandom}
                disabled={processing || disabled}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setForm((prev) => ({ ...prev, generateRandom: checked }));
                  if (event.currentTarget.checked) {
                    handleGeneratePassword();
                  }
                }}
              />
              {passwordPreview && (
                <Text size="xs" c="dimmed">
                  {t('workspace.people.changePassword.generatedPreview', 'Generated password:')} <strong>{passwordPreview}</strong>
                </Text>
              )}
            </Group>
          </Stack>

          <Stack gap="xs">
            <Checkbox
              label={t('workspace.people.changePassword.sendEmail', 'Email the user about this change')}
              checked={form.sendEmail}
              onChange={(event) => setForm({ ...form, sendEmail: event.currentTarget.checked })}
              disabled={!canEmail || processing}
            />
            <Checkbox
              label={t('workspace.people.changePassword.includePassword', 'Include the new password in the email')}
              checked={form.includePassword}
              onChange={(event) => setForm({ ...form, includePassword: event.currentTarget.checked })}
              disabled={!canEmail || !form.sendEmail || processing}
            />
            {!canEmail && (
              <Text size="xs" c="dimmed">
                {mailEnabled
                  ? t('workspace.people.changePassword.emailUnavailable', 'This user does not have an email address. Notifications are disabled.')
                  : t('workspace.people.changePassword.smtpDisabled', 'Email notifications require SMTP to be enabled in settings.')}
              </Text>
            )}
            {canEmail && !form.includePassword && form.sendEmail && (
              <Text size="xs" c="dimmed">
                {t('workspace.people.changePassword.notifyOnly', 'An email will be sent without the password, letting the user know an admin changed it.')}
              </Text>
            )}
          </Stack>

          <Button onClick={handleSubmit} loading={processing} fullWidth size="md" disabled={disabled} mt="md">
            {t('workspace.people.changePassword.submit', 'Update password')}
          </Button>
        </Stack>
      </div>
    </Modal>
  );
}
