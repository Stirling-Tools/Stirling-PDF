import { useTranslation } from 'react-i18next';
import { BASE_PATH } from '@app/constants/app';
import { Button } from '@mantine/core';

// OAuth provider configuration
const oauthProviders = [
  { id: 'google', label: 'Google', file: 'google.svg', isDisabled: false },
  { id: 'github', label: 'GitHub', file: 'github.svg', isDisabled: false },
  { id: 'apple', label: 'Apple', file: 'apple.svg', isDisabled: true },
  { id: 'azure', label: 'Microsoft', file: 'microsoft.svg', isDisabled: true }
];

interface OAuthButtonsProps {
  onProviderClick: (provider: 'github' | 'google' | 'apple' | 'azure') => void
  isSubmitting: boolean
  layout?: 'vertical' | 'grid' | 'icons'
}

export default function OAuthButtons({ onProviderClick, isSubmitting, layout = 'vertical' }: OAuthButtonsProps) {
  const { t } = useTranslation();

  // Filter out disabled providers - don't show them at all
  const enabledProviders = oauthProviders.filter(p => !p.isDisabled);

  if (layout === 'icons') {
    return (
      <div className="oauth-container-icons">
        {enabledProviders.map((p) => (
          <div key={p.id} title={`${t('login.signInWith', 'Sign in with')} ${p.label}`}>
            <Button
              onClick={() => onProviderClick(p.id as any)}
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
        {enabledProviders.map((p) => (
          <div key={p.id} title={`${t('login.signInWith', 'Sign in with')} ${p.label}`}>
            <Button
              onClick={() => onProviderClick(p.id as any)}
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
      {enabledProviders.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onProviderClick(p.id as any)}
          disabled={isSubmitting}
          className="oauth-button-vertical"
          title={p.label}
        >
          <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className="oauth-icon-tiny" />
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  );
}
