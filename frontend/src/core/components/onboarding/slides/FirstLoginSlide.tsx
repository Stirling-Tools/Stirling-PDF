import React, { useState } from 'react';
import { Stack, PasswordInput, Button, Alert, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SlideConfig } from '@app/types/types';
import LocalIcon from '@app/components/shared/LocalIcon';
import { UNIFIED_CIRCLE_CONFIG } from '@app/components/onboarding/slides/unifiedBackgroundConfig';
import { accountService } from '@app/services/accountService';
import { alert as showToast } from '@app/components/toast';
import styles from '@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css';

interface FirstLoginSlideProps {
  username: string;
  onPasswordChanged: () => void;
  usingDefaultCredentials?: boolean;
}

const DEFAULT_PASSWORD = 'stirling';

function FirstLoginForm({ username, onPasswordChanged, usingDefaultCredentials = false }: FirstLoginSlideProps) {
  const { t } = useTranslation();
  // If using default credentials, pre-fill with "stirling" - user won't see this field
  const [currentPassword, setCurrentPassword] = useState(usingDefaultCredentials ? DEFAULT_PASSWORD : '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    // Validation
    if ((!usingDefaultCredentials && !currentPassword) || !newPassword || !confirmPassword) {
      setError(t('firstLogin.allFieldsRequired', 'All fields are required'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('firstLogin.passwordsDoNotMatch', 'New passwords do not match'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('firstLogin.passwordTooShort', 'Password must be at least 8 characters'));
      return;
    }

    if (newPassword === currentPassword) {
      setError(t('firstLogin.passwordMustBeDifferent', 'New password must be different from current password'));
      return;
    }

    try {
      setLoading(true);
      setError('');

      await accountService.changePasswordOnLogin(currentPassword, newPassword);

      showToast({
        alertType: 'success',
        title: t('firstLogin.passwordChangedSuccess', 'Password changed successfully! Please log in again.')
      });

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Wait a moment for the user to see the success message
      setTimeout(() => {
        onPasswordChanged();
      }, 1500);
    } catch (err) {
      console.error('Failed to change password:', err);
      // Extract error message from axios response if available
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(
        axiosError.response?.data?.message ||
        t('firstLogin.passwordChangeFailed', 'Failed to change password. Please check your current password.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.securitySlideContent}>
      <div className={styles.securityCard}>
        <Stack gap="md">
          <div className={styles.securityAlertRow}>
            <LocalIcon icon="info-rounded" width={20} height={20} style={{ color: '#3B82F6', flexShrink: 0 }} />
            <span>
              {t(
                'firstLogin.welcomeMessage',
                'For security reasons, you must change your password on your first login.'
              )}
            </span>
          </div>

          <Text size="sm" fw={500}>
            {t('firstLogin.loggedInAs', 'Logged in as')}: <strong>{username}</strong>
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

          {/* Only show current password field if not using default credentials */}
          {!usingDefaultCredentials && (
            <PasswordInput
              label={t('firstLogin.currentPassword', 'Current Password')}
              placeholder={t('firstLogin.enterCurrentPassword', 'Enter your current password')}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.currentTarget.value)}
              required
              styles={{
                input: { height: 44 },
              }}
            />
          )}

          <PasswordInput
            label={t('firstLogin.newPassword', 'New Password')}
            placeholder={t('firstLogin.enterNewPassword', 'Enter new password (min 8 characters)')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
            minLength={8}
            required
            styles={{
              input: { height: 44 },
            }}
          />

          <PasswordInput
            label={t('firstLogin.confirmPassword', 'Confirm New Password')}
            placeholder={t('firstLogin.reEnterNewPassword', 'Re-enter new password')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            required
            minLength={8}
            styles={{
              input: { height: 44 },
            }}
          />

          <Button
            fullWidth
            onClick={handleSubmit}
            loading={loading}
            disabled={!newPassword || !confirmPassword || newPassword.length < 8 || confirmPassword.length < 8}
            size="md"
            mt="xs"
          >
            {t('firstLogin.changePassword', 'Change Password')}
          </Button>
        </Stack>
      </div>
    </div>
  );
}

export default function FirstLoginSlide({
  username,
  onPasswordChanged,
  usingDefaultCredentials = false,
}: FirstLoginSlideProps): SlideConfig {
  return {
    key: 'first-login',
    title: 'Set Your Password',
    body: (
      <FirstLoginForm
        username={username}
        onPasswordChanged={onPasswordChanged}
        usingDefaultCredentials={usingDefaultCredentials}
      />
    ),
    background: {
      gradientStops: ['#059669', '#0891B2'], // Green to teal - security/trust colors
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

