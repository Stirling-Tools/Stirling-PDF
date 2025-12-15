import React from 'react';
import { useTranslation } from 'react-i18next';
import '@app/routes/authShared/auth.css';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

interface SignupLinkProps {
  signupUrl: string;
  disabled?: boolean;
}

export const SignupLink: React.FC<SignupLinkProps> = ({ signupUrl, disabled = false }) => {
  const { t } = useTranslation();

  const resolveUrl = (rawUrl: string): string => {
    const fallback = 'https://stirling.com/app/signup';
    try {
      const parsed = new URL(rawUrl.trim());
      return parsed.toString();
    } catch {
      return fallback;
    }
  };

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (disabled || !signupUrl) {
      return;
    }

    const url = resolveUrl(signupUrl);

    // Prefer in-app webview on desktop (keeps main app on login)
    if (window.__TAURI__) {
      try {
        const existing = await WebviewWindow.getByLabel('signup');
        if (existing) {
          await existing.setFocus();
          return;
        }

        new WebviewWindow('signup', {
          url,
          title: 'Stirling Cloud – Sign Up',
          width: 1200,
          height: 800,
          visible: true,
          resizable: true,
        });
        return;
      } catch (err) {
        console.error('[SignupLink] opening webview window failed', err);
        // Fall through to browser open
      }
    }

    // Fallback: browser open (single attempt)
    try {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        // If popup blocked, last resort navigate current tab
        window.location.href = url;
      }
      return;
    } catch (err) {
      console.error('[SignupLink] browser open failed', err);
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || !signupUrl}
        className="auth-button auth-cta-button"
        style={{
          width: '100%',
          display: 'inline-block',
          textAlign: 'center',
        }}
      >
        {t('setup.saas.signupCta', 'Need an account? Sign up for Stirling Cloud')}
      </button>
    </div>
  );
};
