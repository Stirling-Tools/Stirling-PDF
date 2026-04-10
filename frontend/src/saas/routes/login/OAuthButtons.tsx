import { oauthProviders } from '@app/constants/authProviders'
import { useTranslation } from '@app/hooks/useTranslation'
import { Tooltip } from '@app/components/shared/Tooltip'
import { withBasePath } from '@app/constants/app'


interface OAuthButtonsProps {
  onProviderClick: (provider: 'github' | 'google') => void
  isSubmitting: boolean
  layout?: 'vertical' | 'grid' | 'icons' | 'fullwidth'
  enabledProviders?: string[]  // List of enabled provider IDs from backend
}

export default function OAuthButtons({ onProviderClick, isSubmitting, layout = 'vertical', enabledProviders: _enabledProviders = [] }: OAuthButtonsProps) {
  const { t } = useTranslation()

  if (layout === 'icons') {
    return (
      <div className="oauth-container-icons">
        {oauthProviders.map((p) => (
          <Tooltip
            key={p.id}
            content={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
            position="top"
          >
            <button
              onClick={() => onProviderClick(p.id as 'github' | 'google')}
              disabled={isSubmitting || p.isDisabled}
              className="oauth-button-icon"
              aria-label={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
            >
              <img src={withBasePath(`/Login/${p.file}`)} alt={p.label} className={`oauth-icon-small ${p.isDisabled ? 'opacity-20' : ''}`}/>
            </button>
          </Tooltip>
        ))}
      </div>
    )
  }

  if (layout === 'grid') {
    return (
      <div className="oauth-container-grid">
        {oauthProviders.map((p) => (
          <Tooltip
            key={p.id}
            content={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
            position="top"
          >
            <button
              onClick={() => onProviderClick(p.id as 'github' | 'google')}
              disabled={isSubmitting || p.isDisabled}
              className="oauth-button-grid"
              aria-label={`${t('login.signInWith', 'Sign in with')} ${p.label}`}
            >
              <img src={withBasePath(`/Login/${p.file}`)} alt={p.label} className={`oauth-icon-medium ${p.isDisabled ? 'opacity-20' : ''}`}/>
            </button>
          </Tooltip>
        ))}
      </div>
    )
  }

  if (layout === 'fullwidth') {
    return (
      <div className="oauth-container-fullwidth">
        {oauthProviders.map((p) => (
          <button
            key={p.id}
            onClick={() => onProviderClick(p.id as 'github' | 'google')}
            disabled={isSubmitting || p.isDisabled}
            className="oauth-button-fullwidth"
            title={p.label}
          >
            <img src={withBasePath(`/Login/${p.file}`)} alt={p.label} className={`oauth-icon-medium ${p.isDisabled ? 'opacity-20' : ''}`} />
            {p.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="oauth-container-vertical">
      {oauthProviders.map((p) => (
        <button
          key={p.id}
          onClick={() => onProviderClick(p.id as 'github' | 'google')}
          disabled={isSubmitting || p.isDisabled}
          className="oauth-button-vertical"
          title={p.label}
        >
          <img src={withBasePath(`/Login/${p.file}`)} alt={p.label} className={`oauth-icon-tiny ${p.isDisabled ? 'opacity-20' : ''}`} />
          {p.label}
        </button>
      ))}
    </div>
  )
}
