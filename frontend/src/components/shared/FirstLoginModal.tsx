import { useState } from 'react';
import { Modal, Stack, Text, PasswordInput, Button, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import LocalIcon from './LocalIcon';
import { accountService } from '../../services/accountService';
import { alert } from '../toast';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '../../styles/zIndex';
import { useAuth } from '../../auth/UseSession';

interface FirstLoginModalProps {
  opened: boolean;
  onPasswordChanged: () => void;
  username: string;
}

/**
 * FirstLoginModal
 *
 * Forces first-time users to change their password.
 * Cannot be dismissed until password is successfully changed.
 */
export default function FirstLoginModal({ opened, onPasswordChanged, username }: FirstLoginModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t('firstLogin.allFieldsRequired', 'All fields are required'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('firstLogin.passwordsDoNotMatch', 'New passwords do not match'));
      return;
    }

    if (newPassword === currentPassword) {
      setError(t('firstLogin.passwordMustBeDifferent', 'New password must be different from current password'));
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Use changePasswordOnLogin to clear the first-use flag
      await accountService.changePasswordOnLogin(currentPassword, newPassword);

      alert({
        alertType: 'success',
        title: t('firstLogin.passwordChangedSuccess', 'Password changed successfully! Please log in again.')
      });

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Backend has logged us out, so clear frontend auth state and redirect to login
      await signOut();
      navigate('/login?messageType=passwordChanged');
    } catch (err: any) {
      console.error('Failed to change password:', err);
      setError(
        err.response?.data?.message ||
        t('firstLogin.passwordChangeFailed', 'Failed to change password. Please check your current password.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {}} // Cannot close
      title={t('firstLogin.title', 'First Time Login')}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      centered
      size="md"
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
    >
      <Stack gap="md">
        <Alert
          icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
          title={t('firstLogin.welcomeTitle', 'Welcome!')}
          color="blue"
        >
          <Text size="sm">
            {t(
              'firstLogin.welcomeMessage',
              'For security reasons, you must change your password on your first login.'
            )}
          </Text>
        </Alert>

        <Text size="sm" fw={500}>
          {t('firstLogin.loggedInAs', 'Logged in as')}: <strong>{username}</strong>
        </Text>

        {error && (
          <Alert
            icon={<LocalIcon icon="error-rounded" width="1rem" height="1rem" />}
            title={t('firstLogin.error', 'Error')}
            color="red"
          >
            {error}
          </Alert>
        )}

        <PasswordInput
          label={t('firstLogin.currentPassword', 'Current Password')}
          placeholder={t('firstLogin.enterCurrentPassword', 'Enter your current password')}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.currentTarget.value)}
          required
        />

        <PasswordInput
          label={t('firstLogin.newPassword', 'New Password')}
          placeholder={t('firstLogin.enterNewPassword', 'Enter new password')}
          value={newPassword}
          onChange={(e) => setNewPassword(e.currentTarget.value)}
          required
        />

        <PasswordInput
          label={t('firstLogin.confirmPassword', 'Confirm New Password')}
          placeholder={t('firstLogin.reEnterNewPassword', 'Re-enter new password')}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.currentTarget.value)}
          required
        />

        <Button
          fullWidth
          onClick={handleSubmit}
          loading={loading}
          disabled={!currentPassword || !newPassword || !confirmPassword}
          mt="md"
        >
          {t('firstLogin.changePassword', 'Change Password')}
        </Button>
      </Stack>
    </Modal>
  );
}
