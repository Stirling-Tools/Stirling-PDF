import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { springAuth } from '@app/auth/springAuthClient';

/**
 * OAuth Callback Handler
 *
 * This component is rendered after OAuth providers (GitHub, Google, etc.) redirect back.
 * The JWT is passed in the URL fragment (#access_token=...) by the Spring backend.
 * We extract it, store in localStorage, and redirect to the home page.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('[AuthCallback] Handling OAuth callback...');

        // Extract JWT from URL fragment (#access_token=...)
        const hash = window.location.hash.substring(1); // Remove '#'
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');

        if (!token) {
          console.error('[AuthCallback] No access_token in URL fragment');
          navigate('/login', {
            replace: true,
            state: { error: 'OAuth login failed - no token received.' }
          });
          return;
        }

        // Store JWT in localStorage
        localStorage.setItem('stirling_jwt', token);
        console.log('[AuthCallback] JWT stored in localStorage');

        // Dispatch custom event for other components to react to JWT availability
        window.dispatchEvent(new CustomEvent('jwt-available'));

        // Validate the token and load user info
        // This calls /api/v1/auth/me with the JWT to get user details
        const { data, error } = await springAuth.getSession();

        if (error || !data.session) {
          console.error('[AuthCallback] Failed to validate token:', error);
          localStorage.removeItem('stirling_jwt');
          navigate('/login', {
            replace: true,
            state: { error: 'OAuth login failed - invalid token.' }
          });
          return;
        }

        // Notify desktop popup listeners (self-hosted SSO flow)
        const isDesktopPopup = typeof window !== 'undefined' && window.opener && window.name === 'stirling-desktop-sso';
        if (isDesktopPopup) {
          try {
            window.opener.postMessage(
              { type: 'stirling-desktop-sso', token },
              '*'
            );
          } catch (postError) {
            console.error('[AuthCallback] Failed to notify desktop window:', postError);
          }

          // Give the message a moment to flush before attempting to close
          setTimeout(() => {
            try {
              window.close();
            } catch (_) {
              // ignore close errors
            }
          }, 150);
        }

        // Desktop fallback flow (when popup was blocked and we navigated directly)
        try {
          const pending = localStorage.getItem('desktop_self_hosted_sso_pending');
          const hasTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
          if (pending && hasTauri) {
            const parsed = JSON.parse(pending) as { serverUrl?: string } | null;
            if (parsed?.serverUrl) {
              try {
                const { completeSelfHostedDeepLink } = await import('../desktopBridge');
                await completeSelfHostedDeepLink(parsed.serverUrl);
              } catch (innerErr) {
                console.error('[AuthCallback] Desktop fallback services unavailable', innerErr);
              }
            }
            localStorage.removeItem('desktop_self_hosted_sso_pending');
          }
        } catch (desktopError) {
          console.error('[AuthCallback] Desktop fallback completion failed:', desktopError);
        }

        console.log('[AuthCallback] Token validated, redirecting to home');

        // Clear the hash from URL and redirect to home page
        navigate('/', { replace: true });
      } catch (error) {
        console.error('[AuthCallback] Error:', error);
        navigate('/login', {
          replace: true,
          state: { error: 'OAuth login failed. Please try again.' }
        });
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh'
    }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
        <div className="text-gray-600">
          Completing authentication...
        </div>
      </div>
    </div>
  );
}
