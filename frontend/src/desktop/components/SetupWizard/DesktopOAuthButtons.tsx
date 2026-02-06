import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authService, UserInfo } from '@app/services/authService';
import { buildOAuthCallbackHtml } from '@app/utils/oauthCallbackHtml';
import { BASE_PATH } from '@app/constants/app';
import { STIRLING_SAAS_URL } from '@app/constants/connection';
import './desktopOAuth.css';

type KnownProviderId = 'google' | 'github' | 'keycloak' | 'azure' | 'apple' | 'oidc';
export type OAuthProviderId = KnownProviderId | string;

export interface DesktopSSOProvider {
  id: OAuthProviderId;
  path?: string;
  label?: string;
}

interface DesktopOAuthButtonsProps {
  onOAuthSuccess: (userInfo: UserInfo) => Promise<void>;
  onError: (error: string) => void;
  isDisabled: boolean;
  serverUrl: string;
  providers: DesktopSSOProvider[];
  mode?: 'saas' | 'selfHosted';
}

export const DesktopOAuthButtons: React.FC<DesktopOAuthButtonsProps> = ({
  onOAuthSuccess,
  onError,
  isDisabled,
  serverUrl,
  providers,
  mode = 'saas',
}) => {
  const { t } = useTranslation();
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleOAuthLogin = async (provider: DesktopSSOProvider) => {
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

      const normalizedServer = serverUrl.replace(/\/+$/, '');
      const usingSupabaseFlow =
        mode === 'saas' || normalizedServer === STIRLING_SAAS_URL.replace(/\/+$/, '');
      const userInfo = usingSupabaseFlow
        ? await authService.loginWithOAuth(provider.id, serverUrl, successHtml, errorHtml)
        : await authService.loginWithSelfHostedOAuth(provider.path || provider.id, serverUrl);

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

  const providerConfig: Record<KnownProviderId, { label: string; file: string }> = {
    google: { label: 'Google', file: 'google.svg' },
    github: { label: 'GitHub', file: 'github.svg' },
    keycloak: { label: 'Keycloak', file: 'keycloak.svg' },
    azure: { label: 'Microsoft', file: 'microsoft.svg' },
    apple: { label: 'Apple', file: 'apple.svg' },
    oidc: { label: 'OpenID', file: 'oidc.svg' },
  };
  const isKnownProvider = (id: OAuthProviderId): id is KnownProviderId =>
    (id as KnownProviderId) in providerConfig;
  const GENERIC_PROVIDER_ICON = 'oidc.svg';

  if (providers.length === 0) {
    return null;
  }

  // Desktop always uses its own styling classes (independent of web)
  return (
    <div className="oauth-container-vertical-desktop">
      {providers
        .filter((providerConfigEntry) => providerConfigEntry && providerConfigEntry.id)
        .map((providerEntry) => {
          const iconConfig = isKnownProvider(providerEntry.id)
            ? providerConfig[providerEntry.id]
            : undefined;
          const label =
            providerEntry.label ||
            iconConfig?.label ||
            (providerEntry.id
              ? providerEntry.id.charAt(0).toUpperCase() + providerEntry.id.slice(1)
              : t('setup.login.sso', 'Single Sign-On'));
          return (
            <button
              key={providerEntry.id}
              onClick={() => handleOAuthLogin(providerEntry)}
              disabled={isDisabled || oauthLoading}
              className="oauth-button-vertical-desktop"
              title={label}
            >
              <span className="oauth-button-left-desktop">
                <span className="oauth-icon-wrapper-desktop">
                  <img
                    src={`${BASE_PATH}/Login/${iconConfig?.file || GENERIC_PROVIDER_ICON}`}
                    alt={label}
                    className="oauth-icon-tiny-desktop"
                  />
                </span>
                <span className="oauth-button-text-desktop">{label}</span>
              </span>
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
