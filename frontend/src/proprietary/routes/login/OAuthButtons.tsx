import { useTranslation } from 'react-i18next';
import { BASE_PATH } from '@app/constants/app';

// Debug flag to show all providers for UI testing
// Set to true to see all SSO options regardless of backend configuration
export const DEBUG_SHOW_ALL_PROVIDERS = false;

// OAuth provider configuration - maps provider ID to display info
export const oauthProviderConfig = {
  google: { label: 'Google', file: 'google.svg' },
  github: { label: 'GitHub', file: 'github.svg' },
  apple: { label: 'Apple', file: 'apple.svg' },
  azure: { label: 'Microsoft', file: 'microsoft.svg' },
  // microsoft and azure are the same, keycloak and oidc need their own icons
  // These are commented out from debug view since they need proper icons or backend doesn't use them
  // keycloak: { label: 'Keycloak', file: 'keycloak.svg' },
  // oidc: { label: 'OIDC', file: 'oidc.svg' }
};

interface OAuthButtonsProps {
  onProviderClick: (provider: 'github' | 'google' | 'apple' | 'azure' | 'keycloak' | 'oidc') => void
  isSubmitting: boolean
  layout?: 'vertical' | 'grid' | 'icons'
  enabledProviders?: string[]  // List of enabled provider IDs from backend
}

export default function OAuthButtons({ onProviderClick, isSubmitting, layout = 'vertical', enabledProviders = [] }: OAuthButtonsProps) {
  const { t } = useTranslation();

  // Debug mode: show all providers for UI testing
  const providersToShow = DEBUG_SHOW_ALL_PROVIDERS
    ? Object.keys(oauthProviderConfig)
    : enabledProviders;

  // Filter to only show enabled providers from backend
  const providers = providersToShow
    .filter(id => id in oauthProviderConfig)
    .map(id => ({
      id,
      ...oauthProviderConfig[id as keyof typeof oauthProviderConfig]
    }));

  // If no providers are enabled, don't render anything
  if (providers.length === 0) {
    return null;
  }

  if (layout === 'icons') {
    return (
      <div className="oauth-container-icons">
        {providers.map((p) => (
          <div key={p.id} title={`${t('login.signInWith', 'Sign in with')} ${p.label}`}>
            <button
              onClick={() => onProviderClick(p.id as any)}
              disabled={isSubmitting}
              className="oauth-button-icon"
              aria-label={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
            >
              <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className="oauth-icon-small"/>
            </button>
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
            <button
              onClick={() => onProviderClick(p.id as any)}
              disabled={isSubmitting}
              className="oauth-button-grid"
              aria-label={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
            >
              <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className="oauth-icon-medium"/>
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="oauth-container-vertical">
      {providers.map((p) => (
        <button
          key={p.id}
          onClick={() => onProviderClick(p.id as any)}
          disabled={isSubmitting}
          className="oauth-button-vertical"
          title={p.label}
        >
          <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className="oauth-icon-tiny" />
          {p.label}
        </button>
      ))}
    </div>
  );
}
