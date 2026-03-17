interface LoginHeaderProps {
  title: string;
  subtitle?: string;
  centerOnly?: boolean;
}

/**
 * Desktop override of LoginHeader — omits the wordmark logo.
 * The logo looks wrong in dark mode and is redundant inside the modal hero.
 */
export default function LoginHeader({ title, subtitle, centerOnly = false }: LoginHeaderProps) {
  return (
    <div className={`login-header${centerOnly ? ' login-header-centered' : ''}`}>
      {title && <h1 className="login-title">{title}</h1>}
      {subtitle && <p className="login-subtitle">{subtitle}</p>}
    </div>
  );
}
