import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Group, Modal, Paper, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { alert as showToast } from '@app/components/toast';
import { useAuth } from '@app/auth/UseSession';
import { accountService } from '@app/services/accountService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

const AccountSection: React.FC = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const [currentPasswordForUsername, setCurrentPasswordForUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSubmitting, setUsernameSubmitting] = useState(false);

  const userIdentifier = useMemo(() => user?.email || user?.username || '', [user?.email, user?.username]);

  const redirectToLogin = useCallback(() => {
    window.location.assign('/login');
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
    } finally {
      redirectToLogin();
    }
  }, [redirectToLogin, signOut]);

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError(t('settings.security.password.required', 'All fields are required.'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.security.password.mismatch', 'New passwords do not match.'));
      return;
    }

    try {
      setPasswordSubmitting(true);
      setPasswordError('');

      await accountService.changePassword(currentPassword, newPassword);

      showToast({
        alertType: 'success',
        title: t('settings.security.password.success', 'Password updated successfully. Please sign in again.'),
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordModalOpen(false);
      await handleLogout();
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setPasswordError(
        axiosError.response?.data?.message ||
          t('settings.security.password.error', 'Unable to update password. Please verify your current password and try again.')
      );
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleUsernameSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!currentPasswordForUsername || !newUsername) {
      setUsernameError(t('settings.security.password.required', 'All fields are required.'));
      return;
    }

    try {
      setUsernameSubmitting(true);
      setUsernameError('');

      await accountService.changeUsername(newUsername, currentPasswordForUsername);

      showToast({
        alertType: 'success',
        title: t('changeCreds.credsUpdated', 'Account updated'),
        body: t('changeCreds.description', 'Changes saved. Please log in again.'),
      });

      setNewUsername('');
      setCurrentPasswordForUsername('');
      setUsernameModalOpen(false);
      await handleLogout();
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setUsernameError(
        axiosError.response?.data?.message ||
          t('changeCreds.error', 'Unable to update username. Please verify your password and try again.')
      );
    } finally {
      setUsernameSubmitting(false);
    }
  };

  return (
    <Stack gap="md">
      <div>
        <Text fw={600} size="lg">
          {t('account.accountSettings', 'Account')}
        </Text>
        <Text size="sm" c="dimmed">
          {t('changeCreds.header', 'Update Your Account Details')}
        </Text>
      </div>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {userIdentifier
              ? t('settings.general.user', 'User') + ': ' + userIdentifier
              : t('account.accountSettings', 'Account Settings')}
          </Text>

          <Group gap="sm" wrap="wrap">
            <Button leftSection={<LocalIcon icon="key-rounded" />} onClick={() => setPasswordModalOpen(true)}>
              {t('settings.security.password.update', 'Update password')}
            </Button>

            <Button
              variant="light"
              leftSection={<LocalIcon icon="edit-rounded" />}
              onClick={() => setUsernameModalOpen(true)}
            >
              {t('account.changeUsername', 'Change username')}
            </Button>

            <Button variant="outline" color="red" leftSection={<LocalIcon icon="logout-rounded" />} onClick={handleLogout}>
              {t('settings.general.logout', 'Log out')}
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Modal
        opened={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title={t('settings.security.title', 'Change password')}
        withinPortal
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <form onSubmit={handlePasswordSubmit}>
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              {t('settings.security.password.subtitle', 'Change your password. You will be logged out after updating.')}
            </Text>

            {passwordError && (
              <Alert icon={<LocalIcon icon="error-rounded" width="1rem" height="1rem" />} color="red" variant="light">
                {passwordError}
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

            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={() => setPasswordModalOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" loading={passwordSubmitting} leftSection={<LocalIcon icon="save-rounded" />}>
                {t('settings.security.password.update', 'Update password')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={usernameModalOpen}
        onClose={() => setUsernameModalOpen(false)}
        title={t('account.changeUsername', 'Change username')}
        withinPortal
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <form onSubmit={handleUsernameSubmit}>
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              {t('changeCreds.changeUsername', 'Update your username. You will be logged out after updating.')}
            </Text>

            {usernameError && (
              <Alert icon={<LocalIcon icon="error-rounded" width="1rem" height="1rem" />} color="red" variant="light">
                {usernameError}
              </Alert>
            )}

            <TextInput
              label={t('changeCreds.newUsername', 'New Username')}
              placeholder={t('changeCreds.newUsername', 'New Username')}
              value={newUsername}
              onChange={(event) => setNewUsername(event.currentTarget.value)}
              required
            />

            <PasswordInput
              label={t('changeCreds.oldPassword', 'Current Password')}
              placeholder={t('changeCreds.oldPassword', 'Current Password')}
              value={currentPasswordForUsername}
              onChange={(event) => setCurrentPasswordForUsername(event.currentTarget.value)}
              required
            />

            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={() => setUsernameModalOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" loading={usernameSubmitting} leftSection={<LocalIcon icon="save-rounded" />}>
                {t('common.save', 'Save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
};

export default AccountSection;
