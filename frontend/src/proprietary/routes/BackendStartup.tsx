import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentMeta } from '@app/hooks/useDocumentMeta';
import AuthLayout from '@app/routes/authShared/AuthLayout';
import { BASE_PATH } from '@app/constants/app';

export default function BackendStartup() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [pollAttempt, setPollAttempt] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const baseUrl = window.location.origin + BASE_PATH;

  // Set document meta
  useDocumentMeta({
    title: `${t('backendStartup.title', 'Backend Starting')} - Stirling PDF`,
    description: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: `${t('backendStartup.title', 'Backend Starting')} - Stirling PDF`,
    ogDescription: t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogImage: `${baseUrl}/og_images/home.png`,
    ogUrl: `${window.location.origin}${window.location.pathname}`
  });

  // Poll backend to check if it's ready
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const checkBackendStatus = async () => {
      try {
        // Use a universal endpoint that works in both proprietary and non-proprietary builds
        // Try /api/v1/info/status first (works in both builds if metrics enabled)
        const response = await fetch(`${BASE_PATH}/api/v1/info/status`, {
          method: 'GET',
          cache: 'no-cache'
        });

        if (!isMounted) return;

        if (response.ok) {
          const data = await response.json();

          // Backend is ready if we get valid status back
          if (data && data.status === 'UP') {
            console.log('[BackendStartup] Backend is ready, redirecting');
            const redirectTo = sessionStorage.getItem('backendStartupRedirect') || '/';
            sessionStorage.removeItem('backendStartupRedirect');

            // Small delay to ensure backend is fully ready
            setTimeout(() => {
              if (isMounted) {
                navigate(redirectTo, { replace: true });
              }
            }, 500);
            return;
          }
        }

        // If status endpoint fails with 403 (metrics disabled), try proprietary endpoint
        if (response.status === 403) {
          console.debug('[BackendStartup] Metrics disabled, trying proprietary endpoint');
          const proprietaryResponse = await fetch(`${BASE_PATH}/api/v1/proprietary/ui-data/login`, {
            method: 'GET',
            cache: 'no-cache'
          });

          if (!isMounted) return;

          if (proprietaryResponse.ok) {
            const data = await proprietaryResponse.json();
            if (data && data.enableLogin !== null) {
              console.log('[BackendStartup] Backend is ready (proprietary check), redirecting');
              const redirectTo = sessionStorage.getItem('backendStartupRedirect') || '/';
              sessionStorage.removeItem('backendStartupRedirect');

              setTimeout(() => {
                if (isMounted) {
                  navigate(redirectTo, { replace: true });
                }
              }, 500);
              return;
            }
          }
        }

        // Backend not ready yet, continue polling
        if (response.status === 404 || response.status === 503) {
          setPollAttempt(prev => prev + 1);
          setStatusMessage(`Backend not ready (${response.status})`);
        } else {
          setPollAttempt(prev => prev + 1);
          setStatusMessage(response.statusText || null);
        }

        // Schedule next poll (exponential backoff, max 5 seconds)
        const delay = Math.min(1000 * Math.pow(1.5, pollAttempt), 5000);
        timeoutId = setTimeout(checkBackendStatus, delay);
      } catch (err) {
        // Network error or backend not responding
        if (!isMounted) return;

        console.debug('[BackendStartup] Poll attempt failed:', err);
        setPollAttempt(prev => prev + 1);
        setStatusMessage(err instanceof Error ? err.message : null);

        // Continue polling with backoff
        const delay = Math.min(1000 * Math.pow(1.5, pollAttempt), 5000);
        timeoutId = setTimeout(checkBackendStatus, delay);
      }
    };

    // Start polling after a short delay to avoid race conditions
    timeoutId = setTimeout(checkBackendStatus, 500);

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate, pollAttempt, BASE_PATH]);

  return (
    <AuthLayout>
      {/* Header without title prop for custom styling */}
      <div className="login-header">
        <div className="login-header-logos">
          <img src={`${BASE_PATH}/branding/StirlingPDFLogoBlackText.svg`} alt="Stirling PDF" className="login-logo-text" />
        </div>
      </div>

      {/* Backend loading message */}
      <div
        className="auth-section"
        style={{
          padding: '1.5rem',
          marginTop: '1rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          border: '1px solid rgba(37, 99, 235, 0.2)',
        }}
      >
        <p style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', textAlign: 'center' }}>
          {t('backendStartup.loadingTitle', 'Backend starting up')}
        </p>
        <p style={{ margin: 0, textAlign: 'center', color: 'rgba(15, 23, 42, 0.8)' }}>
          {t('backendStartup.loadingMessage', 'The backend is currently starting up. This usually takes a few moments.')}
        </p>

        {/* Loading indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid rgba(37, 99, 235, 0.2)',
            borderTop: '3px solid rgba(37, 99, 235, 0.8)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
        </div>

        {statusMessage && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', textAlign: 'center', color: 'rgba(15, 23, 42, 0.6)' }}>
            {statusMessage}
          </p>
        )}

        {pollAttempt > 10 && (
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', textAlign: 'center', color: 'rgba(15, 23, 42, 0.7)' }}>
            {t('backendStartup.takingLonger', 'This is taking longer than expected. The backend should be ready soon.')}
          </p>
        )}
      </div>

      {/* Add spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </AuthLayout>
  );
}
