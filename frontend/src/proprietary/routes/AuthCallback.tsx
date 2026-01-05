import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { springAuth } from '@app/auth/springAuthClient';
import { handleAuthCallbackSuccess } from '@app/extensions/authCallback';

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

        await handleAuthCallbackSuccess(token);

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
