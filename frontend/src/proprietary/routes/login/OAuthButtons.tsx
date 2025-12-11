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
  enabledProviders?: OAuthProvider[]  // List of enabled provider IDs from backend
}

export default function OAuthButtons({ onProviderClick, isSubmitting, layout = 'vertical', enabledProviders = [] }: OAuthButtonsProps) {
  const { t } = useTranslation();

  // Debug mode: show all providers for UI testing
  const providersToShow = DEBUG_SHOW_ALL_PROVIDERS
    ? Object.keys(oauthProviderConfig)
    : enabledProviders;

  // Build provider list - use provider ID to determine icon and label
  const providers = providersToShow.map(id => {
    if (id in oauthProviderConfig) {
      // Known provider - use predefined icon and label
      return {
        id,
        ...oauthProviderConfig[id]
      };
    }
    // Unknown provider - use generic icon and capitalize ID for label
    return {
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
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
            <span>{p.label}</span>
          </Button>
        </div>
      ))}
    </div>
  );
}
