import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authService, UserInfo } from '@app/services/authService';
import { buildOAuthCallbackHtml } from '@app/utils/oauthCallbackHtml';
import { BASE_PATH } from '@app/constants/app';
import '@app/routes/authShared/auth.css';

export type OAuthProvider = 'google' | 'github' | 'keycloak' | 'azure' | 'apple' | 'oidc';

export interface DesktopOAuthProvider {
  id: string;
  label?: string;
  file?: string;
  url?: string;
}

interface DesktopOAuthButtonsProps {
  onOAuthSuccess: (userInfo: UserInfo) => Promise<void>;
  onError: (error: string) => void;
  isDisabled: boolean;
  serverUrl: string;
  providers: DesktopOAuthProvider[];
  /**
   * Optional override to handle provider click (used for self-hosted SSO flow).
   * When provided, the caller is responsible for invoking onOAuthSuccess/onError.
   */
  onProviderClick?: (provider: DesktopOAuthProvider) => Promise<void>;
}

export const DesktopOAuthButtons: React.FC<DesktopOAuthButtonsProps> = ({
  onOAuthSuccess,
  onError,
  isDisabled,
  serverUrl,
  providers,
  onProviderClick,
}) => {
  const { t } = useTranslation();
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleOAuthLogin = async (provider: OAuthProvider) => {
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

  const handleCustomClick = async (provider: DesktopOAuthProvider) => {
    if (!onProviderClick) {
      return;
    }

    try {
      setOauthLoading(true);
      await onProviderClick(provider);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : t('setup.login.error.oauthFailed', 'OAuth login failed. Please try again.');
      onError(errorMessage);
    } finally {
      setOauthLoading(false);
    }
  };

  const providerConfig: Record<string, { label: string; file: string }> = {
    google: { label: 'Google', file: 'google.svg' },
    github: { label: 'GitHub', file: 'github.svg' },
    keycloak: { label: 'Keycloak', file: 'keycloak.svg' },
    azure: { label: 'Microsoft', file: 'microsoft.svg' },
    apple: { label: 'Apple', file: 'apple.svg' },
    oidc: { label: 'OpenID', file: 'oidc.svg' },
  };

  if (providers.length === 0) {
    return null;
  }

  return (
    <div className="oauth-container-vertical">
      {providers
        .map((providerMeta) => {
          const provider =
            (providerMeta.id in providerConfig
              ? providerConfig[providerMeta.id as OAuthProvider]
              : {
                  label: providerMeta.label || providerMeta.id,
                  file: providerMeta.file || 'oidc.svg',
                });

          return (
            <button
              key={providerMeta.id}
              onClick={() => {
                if (onProviderClick) {
                  void handleCustomClick(providerMeta);
                } else {
                  void handleOAuthLogin(providerMeta.id as OAuthProvider);
                }
              }}
              disabled={isDisabled || oauthLoading}
              className="oauth-button-vertical"
              title={provider.label}
            >
              <img
                src={`${BASE_PATH}/Login/${provider.file || 'oidc.svg'}`}
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
