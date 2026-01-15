import React, { useState, useEffect, useCallback } from 'react';
import { Stack, PasswordInput, Button, Alert, Text, Box, TextInput, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SlideConfig } from '@app/types/types';
import LocalIcon from '@app/components/shared/LocalIcon';
import { UNIFIED_CIRCLE_CONFIG } from '@app/components/onboarding/slides/unifiedBackgroundConfig';
import { QRCodeSVG } from 'qrcode.react';
import { accountService, type MfaSetupResponse } from '@app/services/accountService';
import { alert as showToast } from '@app/components/toast';
import styles from '@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css';

interface FirstLoginSlideProps {
  username: string;
  onPasswordChanged: () => void;
  usingDefaultCredentials?: boolean;
  mfaRequired?: boolean;
  requiresPasswordChange?: boolean;
}

const DEFAULT_PASSWORD = 'stirling';

function FirstLoginForm({
  username,
  onPasswordChanged,
  usingDefaultCredentials = false,
  mfaRequired = false,
  requiresPasswordChange = false,
}: FirstLoginSlideProps) {
  const { t } = useTranslation();
  // If using default credentials, pre-fill with "stirling" - user won't see this field
  const [currentPassword, setCurrentPassword] = useState(usingDefaultCredentials ? DEFAULT_PASSWORD : '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mfaSetupData, setMfaSetupData] = useState<MfaSetupResponse | null>(null);
  const [mfaSetupCode, setMfaSetupCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [stepPassword, setStepPassword] = useState(requiresPasswordChange);
  const [stepMfa, setStepMfa] = useState(mfaRequired);

  const tempStepPassword = requiresPasswordChange;
  const normalizeMfaCode = useCallback((value: string) => value.replace(/\D/g, '').slice(0, 6), []);

  useEffect(() => {
    if (!mfaRequired) return;
    setStepPassword(false);
    let isActive = true;

    const fetchMfaSetup = async () => {
      try {
        setMfaError('');
        setMfaSetupCode('');
        const data = await accountService.requestMfaSetup();
        if (isActive) {
          setMfaSetupData(data);
        }
      } catch (fetchError) {
        console.error('Failed to request MFA setup:', fetchError);
        if (isActive) {
          setMfaError(
            t('account.mfa.setupFailed', 'Unable to start two-factor setup. Please try again.')
          );
        }
      }
    };

    fetchMfaSetup();

    return () => {
      isActive = false;
    };
  }, [mfaRequired, t]);

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

      await accountService.changePasswordOnLogin(currentPassword, newPassword, confirmPassword);

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

  const handleEnableMfa = async () => {
    if (!mfaSetupCode.trim()) {
      setMfaError(t('account.mfa.codeRequired', 'Enter the authentication code to continue.'));
      return;
    }

    try {
      setMfaLoading(true);
      setMfaError('');
      await accountService.enableMfa(mfaSetupCode.trim());
      showToast({
        alertType: 'success',
        title: t('account.mfa.enabled', 'Two-factor authentication enabled.')
      });
      setMfaSetupCode('');
      setMfaSetupData(null);
      setStepPassword(tempStepPassword);
      setStepMfa(false);
    } catch (enableError) {
      console.error('Failed to enable MFA:', enableError);
      setMfaError(
        t(
          'account.mfa.enableFailed',
          'Unable to enable two-factor authentication. Check the code and try again.'
        )
      );
    } finally {
      setMfaLoading(false);
      if (!stepPassword) {
        // Wait a moment for the user to see the success message
        setTimeout(() => {
          onPasswordChanged();
        }, 1500);
      }
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

          {/* MFA Setup Section */}
          {stepMfa && (
            <Stack gap="sm">
              <Alert
                icon={<LocalIcon icon="security" width="1rem" height="1rem" />}
                color="blue"
                variant="light"
              >
                <Text size="sm" fw={500}>
                  {t('firstLogin.mfaRequiredTitle', 'Two-factor authentication required')}
                </Text>
                <Text size="sm">
                  {t(
                    'account.mfa.setupDescription',
                    'Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.'
                  )}
                </Text>
              </Alert>

              {mfaSetupData && (
                <Stack gap="sm" align="center">
                  <Box
                    style={{
                      padding: '1.5rem',
                      background: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <QRCodeSVG value={mfaSetupData.otpauthUri} size={180} />
                  </Box>
                  <Text size="sm" c="dimmed">
                    {t('account.mfa.manualKey', 'Manual setup key')}: <strong>{mfaSetupData.secret}</strong>
                  </Text>
                  <Text size="xs" c="orange">
                    {t(
                      'account.mfa.secretWarning',
                      'Keep this key private. Anyone with access can generate valid authentication codes.'
                    )}
                  </Text>
                </Stack>
              )}

              {mfaError && (
                <Alert
                  icon={<LocalIcon icon="error-rounded" width="1rem" height="1rem" />}
                  color="red"
                  variant="light"
                >
                  {mfaError}
                </Alert>
              )}

              <TextInput
                label={t('account.mfa.codeLabel', 'Authentication code')}
                placeholder={t('account.mfa.codePlaceholder', 'Enter 6-digit code')}
                value={mfaSetupCode}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMfaSetupCode(normalizeMfaCode(event.currentTarget.value))}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                minLength={6}
                autoComplete="one-time-code"
                required
              />

              <Group justify="flex-end" gap="sm">
                <Button onClick={handleEnableMfa} loading={mfaLoading}>
                  {t('account.mfa.confirmEnable', 'Enable')}
                </Button>
              </Group>
            </Stack>
          )}

          {/* Password Change Section */}
          {error && stepPassword && (
            <Alert
              icon={<LocalIcon icon="error-rounded" width="1rem" height="1rem" />}
              color="red"
              variant="light"
            >
              {error}
            </Alert>
          )}

          {/* Only show current password field if not using default credentials */}
          {!usingDefaultCredentials && stepPassword && (
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

          {stepPassword && (
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
          )}

          {stepPassword && (
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
          )}

          {stepPassword && (
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
          )}
        </Stack>
      </div>
    </div>
  );
}

export default function FirstLoginSlide({
  username,
  onPasswordChanged,
  usingDefaultCredentials = false,
  mfaRequired = false,
  requiresPasswordChange = false,
}: FirstLoginSlideProps): SlideConfig {
  return {
    key: 'first-login',
    title: 'Set Your Password',
    body: (
      <FirstLoginForm
        username={username}
        onPasswordChanged={onPasswordChanged}
        usingDefaultCredentials={usingDefaultCredentials}
        mfaRequired={mfaRequired}
        requiresPasswordChange={requiresPasswordChange}
      />
    ),
    background: {
      gradientStops: ['#059669', '#0891B2'], // Green to teal - security/trust colors
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}

