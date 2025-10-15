import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '../../constants/app'

// OAuth provider configuration
const oauthProviders = [
  { id: 'github', label: 'GitHub', file: 'github.svg', isDisabled: false },
  { id: 'google', label: 'Google', file: 'google.svg', isDisabled: false },
  { id: 'apple', label: 'Apple', file: 'apple.svg', isDisabled: true },
  { id: 'azure', label: 'Microsoft', file: 'microsoft.svg', isDisabled: true }
]

interface OAuthButtonsProps {
  onProviderClick: (provider: 'github' | 'google' | 'apple' | 'azure') => void
  isSubmitting: boolean
  layout?: 'vertical' | 'grid' | 'icons'
}

export default function OAuthButtons({ onProviderClick, isSubmitting, layout = 'vertical' }: OAuthButtonsProps) {
  const { t } = useTranslation()

  if (layout === 'icons') {
    return (
      <div className="oauth-container-icons">
        {oauthProviders.map((p) => (
          <div key={p.id} title={`${t('login.signInWith', 'Sign in with')} ${p.label}`}>
            <button
              onClick={() => onProviderClick(p.id as any)}
              disabled={isSubmitting || p.isDisabled}
              className="oauth-button-icon"
              aria-label={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
            >
              <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className={`oauth-icon-small ${p.isDisabled ? 'opacity-20' : ''}`}/>
            </button>
          </div>
        ))}
      </div>
    )
  }

  if (layout === 'grid') {
    return (
      <div className="oauth-container-grid">
        {oauthProviders.map((p) => (
          <div key={p.id} title={`${t('login.signInWith', 'Sign in with')} ${p.label}`}>
            <button
              onClick={() => onProviderClick(p.id as any)}
              disabled={isSubmitting || p.isDisabled}
              className="oauth-button-grid"
              aria-label={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
            >
              <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className={`oauth-icon-medium ${p.isDisabled ? 'opacity-20' : ''}`}/>
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="oauth-container-vertical">
      {oauthProviders.map((p) => (
        <button
          key={p.id}
          onClick={() => onProviderClick(p.id as any)}
          disabled={isSubmitting || p.isDisabled}
          className="oauth-button-vertical"
          title={p.label}
        >
          <img src={`${BASE_PATH}/Login/${p.file}`} alt={p.label} className={`oauth-icon-tiny ${p.isDisabled ? 'opacity-20' : ''}`} />
          {p.label}
        </button>
      ))}
    </div>
  )
}
