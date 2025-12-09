import React, { useState } from 'react';
import { Alert, Button, Paper, PasswordInput, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { alert as showToast } from '@app/components/toast';
import { accountService } from '@app/services/accountService';

const AccountSecuritySection: React.FC = () => {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t('settings.security.password.required', 'All fields are required.'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('settings.security.password.mismatch', 'New passwords do not match.'));
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      await accountService.changePassword(currentPassword, newPassword);

      showToast({
        alertType: 'success',
        title: t('settings.security.password.success', 'Password updated successfully. Please sign in again.'),
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(
        axiosError.response?.data?.message ||
          t('settings.security.password.error', 'Unable to update password. Please verify your current password and try again.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="md">
      <div>
        <Text fw={600} size="lg">
          {t('settings.security.title', 'Security')}
        </Text>
        <Text size="sm" c="dimmed">
          {t('settings.security.description', 'Update your password to keep your account secure.')}
        </Text>
      </div>

      <Paper withBorder p="md" radius="md" component="form" onSubmit={handleSubmit}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t('settings.security.password.subtitle', 'Change your password. You will be logged out after updating.')}
          </Text>

          {error && (
            <Alert
              icon={<LocalIcon icon="error-rounded" width="1rem" height="1rem" />}
              color="red"
              variant="light"
            >
              {error}
            </Alert>
          )}

          <PasswordInput
            label={t('settings.security.password.current', 'Current password')}
            placeholder={t('settings.security.password.currentPlaceholder', 'Enter your current password')}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            required
          />

          <PasswordInput
            label={t('settings.security.password.new', 'New password')}
            placeholder={t('settings.security.password.newPlaceholder', 'Enter a new password')}
            value={newPassword}
            onChange={(event) => setNewPassword(event.currentTarget.value)}
            required
          />

          <PasswordInput
            label={t('settings.security.password.confirm', 'Confirm new password')}
            placeholder={t('settings.security.password.confirmPlaceholder', 'Re-enter your new password')}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            required
          />

          <Button type="submit" variant="filled" loading={submitting} leftSection={<LocalIcon icon="key-rounded" />}>
            {t('settings.security.password.update', 'Update password')}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
};

export default AccountSecuritySection;
