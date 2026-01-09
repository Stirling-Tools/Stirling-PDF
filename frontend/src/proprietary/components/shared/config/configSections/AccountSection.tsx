import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, Modal, Paper, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { alert as showToast } from '@app/components/toast';
import { useAuth } from '@app/auth/UseSession';
import { accountService, type MfaSetupResponse } from '@app/services/accountService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { QRCodeSVG } from 'qrcode.react';

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
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetupModalOpen, setMfaSetupModalOpen] = useState(false);
  const [mfaDisableModalOpen, setMfaDisableModalOpen] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<MfaSetupResponse | null>(null);
  const [mfaSetupCode, setMfaSetupCode] = useState('');
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const authTypeFromMetadata = useMemo(() => {
    const metadata = user?.app_metadata as { authType?: string; authenticationType?: string } | undefined;
    return metadata?.authenticationType ?? metadata?.authType;
  }, [user?.app_metadata]);

  const normalizedAuthType = useMemo(
    () => (user?.authenticationType ?? authTypeFromMetadata ?? '').toLowerCase(),
    [authTypeFromMetadata, user?.authenticationType]
  );
  const isSsoUser = useMemo(() => ['sso', 'oauth2', 'saml2'].includes(normalizedAuthType), [normalizedAuthType]);

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

    if (isSsoUser) {
      setPasswordError(t('settings.security.password.ssoDisabled', 'Password changes are managed by your identity provider.'));
      return;
    }

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

  useEffect(() => {
    const fetchAccountData = async () => {
      try {
        const data = await accountService.getAccountData();
        setMfaEnabled(data.mfaEnabled ?? false);
      } catch {
        // ignore fetch errors for account data
        console.warn('Failed to fetch account data');
      }
    };
    void fetchAccountData();
  }, []);

  const handleStartMfaSetup = useCallback(async () => {
    try {
      setMfaLoading(true);
      setMfaError('');
      setMfaSetupCode('');
      const data = await accountService.requestMfaSetup();
      setMfaSetupData(data);
      setMfaSetupModalOpen(true);
    } catch (err) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setMfaError(
        axiosError.response?.data?.error ||
          t('account.mfa.setupFailed', 'Unable to start two-factor setup. Please try again.')
      );
    } finally {
      setMfaLoading(false);
    }
  }, [t]);

  const handleEnableMfa = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!mfaSetupCode.trim()) {
        setMfaError(t('account.mfa.codeRequired', 'Enter the authentication code to continue.'));
        return;
      }
      try {
        setMfaLoading(true);
        setMfaError('');
        await accountService.enableMfa(mfaSetupCode.trim());
        setMfaEnabled(true);
        setMfaSetupModalOpen(false);
        setMfaSetupData(null);
        setMfaSetupCode('');
        showToast({
          alertType: 'success',
          title: t('account.mfa.enabled', 'Two-factor authentication enabled.'),
        });
      } catch (err) {
        const axiosError = err as { response?: { data?: { error?: string } } };
        setMfaError(
          axiosError.response?.data?.error ||
            t('account.mfa.enableFailed', 'Unable to enable two-factor authentication. Check the code and try again.')
        );
      } finally {
        setMfaLoading(false);
      }
    },
    [mfaSetupCode, t]
  );

  const handleDisableMfa = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!mfaDisableCode.trim()) {
        setMfaError(t('account.mfa.codeRequired', 'Enter the authentication code to continue.'));
        return;
      }
      try {
        setMfaLoading(true);
        setMfaError('');
        await accountService.disableMfa(mfaDisableCode.trim());
        setMfaEnabled(false);
        setMfaDisableModalOpen(false);
        setMfaDisableCode('');
        showToast({
          alertType: 'success',
          title: t('account.mfa.disabled', 'Two-factor authentication disabled.'),
        });
      } catch (err) {
        const axiosError = err as { response?: { data?: { error?: string } } };
        setMfaError(
          axiosError.response?.data?.error ||
            t('account.mfa.disableFailed', 'Unable to disable two-factor authentication. Check the code and try again.')
        );
      } finally {
        setMfaLoading(false);
      }
    },
    [mfaDisableCode, t]
  );

  const handleCloseMfaSetupModal = useCallback(async () => {
    setMfaSetupModalOpen(false);
    setMfaSetupData(null);
    setMfaSetupCode('');
    setMfaError('');
    try {
      await accountService.cancelMfaSetup();
    } catch {
      console.warn('Failed to clear pending MFA setup');
    }
  }, []);

  const handleCloseMfaDisableModal = useCallback(() => {
    setMfaDisableModalOpen(false);
    setMfaDisableCode('');
    setMfaError('');
  }, []);

  const handleUsernameSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (isSsoUser) {
      setUsernameError(t('changeCreds.ssoManaged', 'Your account is managed by your identity provider.'));
      return;
    }

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

          <Stack gap="xs">
            {isSsoUser && (
              <Alert icon={<LocalIcon icon="info" width="1rem" height="1rem" />} color="blue" variant="light">
                {t('changeCreds.ssoManaged', 'Your account is managed by your identity provider.')}
              </Alert>
            )}

            <Group gap="sm" wrap="wrap">
              {!isSsoUser && (
                <Button leftSection={<LocalIcon icon="key-rounded" />} onClick={() => setPasswordModalOpen(true)}>
                  {t('settings.security.password.update', 'Update password')}
                </Button>
              )}

              {!isSsoUser && (
                <Button
                  variant="light"
                  leftSection={<LocalIcon icon="edit-rounded" />}
                  onClick={() => setUsernameModalOpen(true)}
                >
                  {t('account.changeUsername', 'Change username')}
                </Button>
              )}

              <Button variant="outline" color="red" leftSection={<LocalIcon icon="logout-rounded" />} onClick={handleLogout}>
                {t('settings.general.logout', 'Log out')}
              </Button>
            </Group>
          </Stack>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={600}>{t('account.mfa.title', 'Two-factor authentication')}</Text>
          <Text size="sm" c="dimmed">
            {t('account.mfa.description', 'Add an extra layer of security to your account.')}
          </Text>
          {mfaError && (
            <Alert icon={<LocalIcon icon="error-rounded" width="1rem" height="1rem" />} color="red" variant="light">
              {mfaError}
            </Alert>
          )}
          {isSsoUser ? (
            <Alert icon={<LocalIcon icon="info" width="1rem" height="1rem" />} color="blue" variant="light">
              {t(
                'account.mfa.ssoManaged',
                'Two-factor authentication for this account is managed by your identity provider.'
              )}
            </Alert>
          ) : (
            <Group gap="sm" wrap="wrap">
              {!mfaEnabled ? (
                <Button
                  leftSection={<LocalIcon icon="shield-check-rounded" />}
                  onClick={handleStartMfaSetup}
                  loading={mfaLoading}
                >
                  {t('account.mfa.enableButton', 'Enable two-factor authentication')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  color="red"
                  leftSection={<LocalIcon icon="shield-cross-rounded" />}
                  onClick={() => {
                    setMfaError('');
                    setMfaDisableCode('');
                    setMfaDisableModalOpen(true);
                  }}
                >
                  {t('account.mfa.disableButton', 'Disable two-factor authentication')}
                </Button>
              )}
            </Group>
          )}
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
        opened={mfaSetupModalOpen}
        onClose={handleCloseMfaSetupModal}
        title={t('account.mfa.setupTitle', 'Set up two-factor authentication')}
        withinPortal
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <form onSubmit={handleEnableMfa}>
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              {t(
                'account.mfa.setupDescription',
                'Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.'
              )}
            </Text>
            {mfaSetupData && (
              <Stack gap="sm" align="center">
                <QRCodeSVG value={mfaSetupData.otpauthUri} size={180} includeMargin level="H" />
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
            <TextInput
              label={t('account.mfa.codeLabel', 'Authentication code')}
              placeholder={t('account.mfa.codePlaceholder', 'Enter 6-digit code')}
              value={mfaSetupCode}
              onChange={(event) => setMfaSetupCode(event.currentTarget.value)}
              required
            />
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={handleCloseMfaSetupModal}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" loading={mfaLoading}>
                {t('account.mfa.confirmEnable', 'Enable')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={mfaDisableModalOpen}
        onClose={handleCloseMfaDisableModal}
        title={t('account.mfa.disableTitle', 'Disable two-factor authentication')}
        withinPortal
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <form onSubmit={handleDisableMfa}>
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              {t('account.mfa.disableDescription', 'Enter a valid authentication code to disable two-factor authentication.')}
            </Text>
            <TextInput
              label={t('account.mfa.codeLabel', 'Authentication code')}
              placeholder={t('account.mfa.codePlaceholder', 'Enter 6-digit code')}
              value={mfaDisableCode}
              onChange={(event) => setMfaDisableCode(event.currentTarget.value)}
              required
            />
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={handleCloseMfaDisableModal}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" color="red" loading={mfaLoading}>
                {t('account.mfa.confirmDisable', 'Disable')}
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
