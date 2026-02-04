import { useTranslation } from 'react-i18next';
import { BASE_PATH } from '@app/constants/app';
import { type OAuthProvider } from '@app/auth/oauthTypes';
import { Button } from '@mantine/core';

// Debug flag to show all providers for UI testing
// Set to true to see all SSO options regardless of backend configuration
export const DEBUG_SHOW_ALL_PROVIDERS = false;

// OAuth provider configuration - maps provider ID to display info
// Known providers get custom icons; unknown providers use generic SSO icon
export const oauthProviderConfig: Record<string, { label: string; file: string }> = {
  google: { label: 'Google', file: 'google.svg' },
  github: { label: 'GitHub', file: 'github.svg' },
  apple: { label: 'Apple', file: 'apple.svg' },
  azure: { label: 'Microsoft', file: 'microsoft.svg' },
  keycloak: { label: 'Keycloak', file: 'keycloak.svg' },
  cloudron: { label: 'Cloudron', file: 'cloudron.svg' },
  authentik: { label: 'Authentik', file: 'authentik.svg' },
  oidc: { label: 'OIDC', file: 'oidc.svg' }
};

// Generic fallback for unknown providers
const GENERIC_PROVIDER_ICON = 'oidc.svg';

interface OAuthButtonsProps {
  onProviderClick: (provider: OAuthProvider) => void
  isSubmitting: boolean
  layout?: 'vertical' | 'grid' | 'icons'
  enabledProviders?: OAuthProvider[]  // List of full auth paths from backend (e.g., '/oauth2/authorization/google', '/saml2/authenticate/stirling')
  ctaPrefix?: string
}

export default function OAuthButtons({
  onProviderClick,
  isSubmitting,
  layout = 'vertical',
  enabledProviders = [],
  ctaPrefix,
}: OAuthButtonsProps) {
  const { t } = useTranslation();

  // Debug mode: show all providers for UI testing
  const providersToShow = DEBUG_SHOW_ALL_PROVIDERS
    ? Object.keys(oauthProviderConfig)
    : enabledProviders;

  // Build provider list - extract provider ID from full path for display
  const providers = providersToShow.map(pathOrId => {
    // Extract provider ID from full path (e.g., '/saml2/authenticate/stirling' -> 'stirling')
    const providerId = pathOrId.split('/').pop() || pathOrId;

    if (providerId in oauthProviderConfig) {
      // Known provider - use predefined icon and label
      return {
        id: pathOrId,  // Keep full path for redirect
        providerId,    // Store extracted ID for display lookup
        ...oauthProviderConfig[providerId]
      };
    }
    // Unknown provider - use generic icon and capitalize ID for label
    return {
      id: pathOrId,  // Keep full path for redirect
      providerId,    // Store extracted ID for display lookup
      label: providerId.charAt(0).toUpperCase() + providerId.slice(1),
      file: GENERIC_PROVIDER_ICON
    };
  });

  // If no providers are enabled, don't render anything
  if (providers.length === 0) {
    return null;
  }

  if (layout === 'icons') {
    return (
      <div className="oauth-container-icons">
        {providers.map((p) => (
          <div key={p.id} title={`${t('login.signInWith', 'Sign in with')} ${p.label}`}>
            <Button
              onClick={() => onProviderClick(p.id)}
              disabled={isSubmitting}
              className="oauth-button-icon"
              aria-label={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
              variant="default"
            >
              <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className="oauth-icon-small"/>
            </Button>
          </div>
        ))}
      </div>
    );
  }

  if (layout === 'grid') {
    return (
      <div className="oauth-container-grid">
        {providers.map((p) => (
          <div key={p.id} title={`${t('login.signInWith', 'Sign in with')} ${p.label}`}>
            <Button
              onClick={() => onProviderClick(p.id)}
              disabled={isSubmitting}
              className="oauth-button-grid"
              aria-label={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
              variant="default"
            >
              <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className="oauth-icon-medium"/>
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="oauth-container-vertical">
      {providers.map((p) => (
        <div key={p.id} title={`${t('login.signInWith', 'Sign in with')} ${p.label}`}>
          <Button
            onClick={() => onProviderClick(p.id)}
            disabled={isSubmitting}
            className="oauth-button-vertical"
            aria-label={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
            variant="default"
          >
            <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className="oauth-icon-tiny" />
            <span>{ctaPrefix ? `${ctaPrefix} ${p.label}` : p.label}</span>
          </Button>
        </div>
      ))}
    </div>
  );
}
