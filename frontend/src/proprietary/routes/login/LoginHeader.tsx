
import { useLogoAssets } from '@app/hooks/useLogoAssets';

interface LoginHeaderProps {
  title: string
  subtitle?: string
  centerOnly?: boolean
}

export default function LoginHeader({ title, subtitle, centerOnly = false }: LoginHeaderProps) {
  const { wordmark } = useLogoAssets();

  return (
    <div className={`login-header${centerOnly ? ' login-header-centered' : ''}`}>
      <div className="login-header-logos">
        <img src={wordmark.black} alt="Stirling PDF" className="login-logo-text" />
      </div>
      {title && <h1 className="login-title">{title}</h1>}
      {subtitle && (
        <p className="login-subtitle">{subtitle}</p>
      )}
    </div>
  );
}
