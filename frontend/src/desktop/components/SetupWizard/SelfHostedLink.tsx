import React from 'react';
import { useTranslation } from 'react-i18next';
import '@app/routes/authShared/auth.css';

interface SelfHostedLinkProps {
  onClick: () => void;
  disabled?: boolean;
}

export const SelfHostedLink: React.FC<SelfHostedLinkProps> = ({ onClick, disabled = false }) => {
  const { t } = useTranslation();

  return (
    <div className="navigation-link-container" style={{ marginTop: '1.5rem' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="navigation-link-button"
      >
        {t('setup.selfhosted.link', 'or connect to a self hosted account')}
      </button>
    </div>
  );
};
