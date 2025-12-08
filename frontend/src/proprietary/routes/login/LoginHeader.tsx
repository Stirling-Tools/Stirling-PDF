
import { useLogoAssets } from '@app/hooks/useLogoAssets';

interface LoginHeaderProps {
  title: string
  subtitle?: string
}

export default function LoginHeader({ title, subtitle }: LoginHeaderProps) {
  const { wordmark } = useLogoAssets();

  return (
    <div className="login-header">
      <div className="login-header-logos">
        <img src={wordmark.black} alt="Stirling PDF" className="login-logo-text" />
      </div>
      <h1 className="login-title">{title}</h1>
      {subtitle && (
        <p className="login-subtitle">{subtitle}</p>
      )}
    </div>
  );
}
