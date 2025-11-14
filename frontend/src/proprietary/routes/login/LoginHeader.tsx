
import { BASE_PATH } from '@app/constants/app';

interface LoginHeaderProps {
  title: string
  subtitle?: string
}

export default function LoginHeader({ title, subtitle }: LoginHeaderProps) {
  return (
    <div className="login-header">
      <div className="login-header-logos">
        <img src={`${BASE_PATH}/branding/StirlingPDFLogoBlackText.svg`} alt="Stirling PDF" className="login-logo-text" />
      </div>
      <h1 className="login-title">{title}</h1>
      {subtitle && (
        <p className="login-subtitle">{subtitle}</p>
      )}
    </div>
  );
}
