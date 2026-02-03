import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { springAuth } from '@app/auth/springAuthClient';
import { handleAuthCallbackSuccess } from '@app/extensions/authCallback';
import styles from '@app/routes/AuthCallback.module.css';

/**
 * OAuth Callback Handler
 *
 * This component is rendered after OAuth providers (GitHub, Google, etc.) redirect back.
 * The JWT is passed in the URL fragment (#access_token=...) by the Spring backend.
 * We extract it, store in localStorage, and redirect to the home page.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const processingRef = useRef(false);

  // Log component lifecycle
  useEffect(() => {
    const mountId = Math.random().toString(36).substring(7);
    console.log(`[AuthCallback:${mountId}] 🔵 Component mounted`);
    return () => {
      console.log(`[AuthCallback:${mountId}] 🔴 Component unmounting`);
    };
  }, []);

  useEffect(() => {
    const handleCallback = async () => {
      const startTime = performance.now();
      const executionId = Math.random().toString(36).substring(7);

      console.log(`[AuthCallback:${executionId}] ════════════════════════════════════`);
      console.log(`[AuthCallback:${executionId}] Starting authentication callback`);
      console.log(`[AuthCallback:${executionId}] URL: ${window.location.href}`);
      console.log(`[AuthCallback:${executionId}] Hash: ${window.location.hash}`);

      // Prevent double execution (React 18 Strict Mode + navigate dependency)
      if (processingRef.current) {
        console.warn(`[AuthCallback:${executionId}] ⚠️  Already processing, skipping duplicate execution`);
        console.warn(`[AuthCallback:${executionId}] This is expected in React Strict Mode (development)`);
        return;
      }
      processingRef.current = true;

      try {
        console.log(`[AuthCallback:${executionId}] Step 1: Extracting token from URL fragment`);

        // Extract JWT from URL fragment (#access_token=...)
        const hash = window.location.hash.substring(1); // Remove '#'
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');

        if (!token) {
          console.error(`[AuthCallback:${executionId}] ❌ No access_token in URL fragment`);
          navigate('/login', {
            replace: true,
            state: { error: 'OAuth login failed - no token received.' }
          });
          return;
        }

        console.log(`[AuthCallback:${executionId}] ✓ Token extracted (length: ${token.length})`);
        console.log(`[AuthCallback:${executionId}] Step 2: Storing JWT in localStorage`);

        // Store JWT in localStorage
        localStorage.setItem('stirling_jwt', token);
        console.log(`[AuthCallback:${executionId}] ✓ JWT stored in localStorage`);

        console.log(`[AuthCallback:${executionId}] Step 3: Dispatching 'jwt-available' event`);
        // Dispatch custom event for other components to react to JWT availability
        window.dispatchEvent(new CustomEvent('jwt-available'));
        console.log(`[AuthCallback:${executionId}] ✓ Event dispatched`);

        console.log(`[AuthCallback:${executionId}] Step 4: Validating token with backend`);
        // Validate the token and load user info
        // This calls /api/v1/auth/me with the JWT to get user details
        const { data, error } = await springAuth.getSession();

        if (error || !data.session) {
          console.error(`[AuthCallback:${executionId}] ❌ Failed to validate token:`, error);
          localStorage.removeItem('stirling_jwt');
          navigate('/login', {
            replace: true,
            state: { error: 'OAuth login failed - invalid token.' }
          });
          return;
        }

        console.log(`[AuthCallback:${executionId}] ✓ Token validated, user: ${data.session.user.username}`);
        console.log(`[AuthCallback:${executionId}] Step 5: Running platform-specific callback handlers`);

        await handleAuthCallbackSuccess(token);

        console.log(`[AuthCallback:${executionId}] ✓ Callback handlers complete`);
        console.log(`[AuthCallback:${executionId}] Step 6: Navigating to home page`);

        // Clear the hash from URL and redirect to home page
        navigate('/', { replace: true });

        const duration = performance.now() - startTime;
        console.log(`[AuthCallback:${executionId}] ✓ Authentication complete (${duration.toFixed(2)}ms)`);
        console.log(`[AuthCallback:${executionId}] ════════════════════════════════════`);
      } catch (error) {
        const duration = performance.now() - startTime;
        console.error(`[AuthCallback:${executionId}] ════════════════════════════════════`);
        console.error(`[AuthCallback:${executionId}] ❌ FATAL ERROR during authentication`);
        console.error(`[AuthCallback:${executionId}] Error:`, error);
        console.error(`[AuthCallback:${executionId}] Error name:`, (error as Error)?.name);
        console.error(`[AuthCallback:${executionId}] Error message:`, (error as Error)?.message);
        console.error(`[AuthCallback:${executionId}] Error stack:`, (error as Error)?.stack);
        console.error(`[AuthCallback:${executionId}] Duration before failure: ${duration.toFixed(2)}ms`);
        console.error(`[AuthCallback:${executionId}] ════════════════════════════════════`);
        navigate('/login', {
          replace: true,
          state: { error: 'OAuth login failed. Please try again.' }
        });
      }
    };

    handleCallback();
  }, []); // Empty deps - only run once on mount. navigate is stable, processingRef prevents double execution

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={`${styles.icon} ${styles.iconNeutral}`}>...</div>
        <div className={styles.title}>Completing authentication</div>
        <div className={styles.message}>Please wait while we finish signing you in.</div>
        <div className={styles.loadingExtra}>You can close this window once it completes.</div>
      </div>
    </div>
  );
}
