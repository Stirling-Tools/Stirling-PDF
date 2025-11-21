import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { springAuth } from '@app/auth/springAuthClient';

/**
 * OAuth Callback Handler
 *
 * This component is rendered after OAuth providers (GitHub, Google, etc.) redirect back.
 * The JWT is set in an HttpOnly cookie by the Spring backend - no URL parsing needed.
 * We just validate the session and redirect to the home page.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('[AuthCallback] Handling OAuth callback...');

        // JWT is already in HttpOnly cookie from the OAuth redirect
        // Just validate the session to ensure we're authenticated
        const { data, error } = await springAuth.getSession();

        if (error || !data.session) {
          console.error('[AuthCallback] Failed to validate session:', error);
          navigate('/login', {
            replace: true,
            state: { error: 'OAuth login failed.' }
          });
          return;
        }

        console.log('[AuthCallback] Session validated, redirecting to home');

        // Redirect to home page
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
