import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authService, UserInfo } from '@app/services/authService';
import { buildOAuthCallbackHtml } from '@app/utils/oauthCallbackHtml';
import { BASE_PATH } from '@app/constants/app';
import '@app/routes/authShared/auth.css';

interface DesktopOAuthButtonsProps {
  onOAuthSuccess: (userInfo: UserInfo) => Promise<void>;
  onError: (error: string) => void;
  isDisabled: boolean;
  serverUrl: string;
  providers: Array<'google' | 'github'>;
}

export const DesktopOAuthButtons: React.FC<DesktopOAuthButtonsProps> = ({
  onOAuthSuccess,
  onError,
  isDisabled,
  serverUrl,
  providers,
}) => {
  const { t } = useTranslation();
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    // Prevent concurrent OAuth attempts
    if (oauthLoading || isDisabled) {
      return;
    }

    try {
      setOauthLoading(true);

      // Build callback page HTML with translations and dark mode support
      const successHtml = buildOAuthCallbackHtml({
        title: t('oauth.success.title', 'Authentication Successful'),
        message: t('oauth.success.message', 'You can close this window and return to Stirling PDF.'),
        isError: false,
      });

      const errorHtml = buildOAuthCallbackHtml({
        title: t('oauth.error.title', 'Authentication Failed'),
        message: t('oauth.error.message', 'Authentication was not successful. You can close this window and try again.'),
        isError: true,
        errorPlaceholder: true, // {error} will be replaced by Rust
      });

      const userInfo = await authService.loginWithOAuth(provider, serverUrl, successHtml, errorHtml);

      // Call the onOAuthSuccess callback to complete setup
      await onOAuthSuccess(userInfo);
    } catch (error) {
      console.error('OAuth login failed:', error);

      const errorMessage = error instanceof Error
        ? error.message
        : t('setup.login.error.oauthFailed', 'OAuth login failed. Please try again.');

      onError(errorMessage);
      setOauthLoading(false);
    }
  };

  const providerConfig = {
    google: { label: 'Google', file: 'google.svg' },
    github: { label: 'GitHub', file: 'github.svg' },
  };

  if (providers.length === 0) {
    return null;
  }

  return (
    <div className="oauth-container-vertical">
      {providers.map((providerId) => {
        const provider = providerConfig[providerId];
        return (
          <button
            key={providerId}
            onClick={() => handleOAuthLogin(providerId)}
            disabled={isDisabled || oauthLoading}
            className="oauth-button-vertical"
            title={provider.label}
          >
            <img
              src={`${BASE_PATH}/Login/${provider.file}`}
              alt={provider.label}
              className="oauth-icon-tiny"
            />
            {provider.label}
          </button>
        );
      })}
      {oauthLoading && (
        <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#6b7280', textAlign: 'center' }}>
          {t('setup.login.oauthPending', 'Opening browser for authentication...')}
        </p>
      )}
    </div>
  );
};
