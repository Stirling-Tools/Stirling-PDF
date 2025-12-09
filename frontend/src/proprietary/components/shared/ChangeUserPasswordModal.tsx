import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionIcon,
  Button,
  Checkbox,
  CloseButton,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  Tooltip,
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
  const charsetLength = charset.length;
  const uint8Array = new Uint8Array(length);
  window.crypto.getRandomValues(uint8Array);
  // To avoid modulo bias, discard values >= 256 - (256 % charsetLength)
  for (let i = 0; password.length < length; ) {
    const randomByte = uint8Array[i];
    i++;
    if (randomByte >= Math.floor(256 / charsetLength) * charsetLength) {
      // Discard and generate a new random value
      if (i >= uint8Array.length) {
        // Exhausted the array, fill a new one
        window.crypto.getRandomValues(uint8Array);
        i = 0;
      }
      continue;
    }
    const randomIndex = randomByte % charsetLength;
    password += charset[randomIndex];
  }
  return password;
}

export default function ChangeUserPasswordModal({ opened, onClose, user, onSuccess, mailEnabled }: ChangeUserPasswordModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    newPassword: '',
    confirmPassword: '',
    generateRandom: false,
    sendEmail: false,
    includePassword: false,
    forcePasswordChange: false,
  });
  const [processing, setProcessing] = useState(false);

  const disabled = !user;

  const handleGeneratePassword = () => {
    const generated = generateSecurePassword();
    setForm((prev) => ({ ...prev, newPassword: generated, confirmPassword: generated, generateRandom: true }));
  };

  const handleCopyPassword = async () => {
    if (!form.newPassword) return;
    try {
      await navigator.clipboard.writeText(form.newPassword);
      alert({ alertType: 'success', title: t('workspace.people.changePassword.copiedToClipboard', 'Password copied to clipboard') });
    } catch (error) {
      alert({ alertType: 'error', title: t('workspace.people.changePassword.copyFailed', 'Failed to copy password') });
    }
  };

  const resetState = () => {
    setForm({
      newPassword: '',
      confirmPassword: '',
      generateRandom: false,
      sendEmail: false,
      includePassword: false,
      forcePasswordChange: false,
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

    if (!form.generateRandom && form.newPassword !== form.confirmPassword) {
      alert({ alertType: 'error', title: t('workspace.people.changePassword.passwordMismatch', 'Passwords do not match') });
      return;
    }

    const payload: ChangeUserPasswordRequest = {
      username: user.username,
      newPassword: form.newPassword, // Always send the password (frontend generates it when generateRandom is true)
      generateRandom: false, // Not needed since we're generating on frontend
      sendEmail: form.sendEmail,
      includePassword: form.includePassword,
      forcePasswordChange: form.forcePasswordChange,
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
        confirmPassword: '',
        generateRandom: false,
        sendEmail: false,
        includePassword: false,
        forcePasswordChange: false,
      });
    }
  }, [opened, user?.username]);

  // Check if username is a valid email format
  const isValidEmail = (email: string | undefined) => {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const canEmail = mailEnabled && isValidEmail(user?.username);
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
              disabled={processing || disabled || form.generateRandom}
              data-autofocus
            />
            <PasswordInput
              label={t('workspace.people.changePassword.confirmPassword', 'Confirm password')}
              placeholder={t('workspace.people.changePassword.confirmPlaceholder', 'Re-enter the new password')}
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.currentTarget.value, generateRandom: false })}
              disabled={processing || disabled || form.generateRandom}
              error={!form.generateRandom && form.confirmPassword && form.newPassword !== form.confirmPassword ? t('workspace.people.changePassword.passwordMismatch', 'Passwords do not match') : undefined}
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
                <Group gap="xs" align="center">
                  <Text size="xs" c="dimmed">
                    {t('workspace.people.changePassword.generatedPreview', 'Generated password:')} <strong>{passwordPreview}</strong>
                  </Text>
                  <Tooltip label={t('workspace.people.changePassword.copyTooltip', 'Copy to clipboard')}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={handleCopyPassword}
                      disabled={processing}
                    >
                      <LocalIcon icon="content-copy" width="0.9rem" height="0.9rem" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )}
            </Group>
          </Stack>

          <Stack gap="xs">
            <Checkbox
              label={t('workspace.people.changePassword.sendEmail', 'Email the user about this change')}
              checked={canEmail && form.sendEmail}
              onChange={(event) => setForm({ ...form, sendEmail: event.currentTarget.checked })}
              disabled={!canEmail || processing}
            />
            <Checkbox
              label={t('workspace.people.changePassword.includePassword', 'Include the new password in the email')}
              checked={canEmail && form.sendEmail && form.includePassword}
              onChange={(event) => setForm({ ...form, includePassword: event.currentTarget.checked })}
              disabled={!canEmail || !form.sendEmail || processing}
            />
            <Checkbox
              label={t('workspace.people.changePassword.forcePasswordChange', 'Force user to change password on next login')}
              checked={form.forcePasswordChange}
              onChange={(event) => setForm({ ...form, forcePasswordChange: event.currentTarget.checked })}
              disabled={processing || disabled}
            />
            {!canEmail && (
              <Text size="xs" c="dimmed">
                {mailEnabled
                  ? t('workspace.people.changePassword.emailUnavailable', "This user's email is not a valid email address. Notifications are disabled.")
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
