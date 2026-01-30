import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '@app/routes/AuthCallback.module.css';
import { useAuth } from '@app/auth/UseSession';

// Use sessionStorage to track callback handling across React StrictMode double-renders
// Timestamp-based to allow retry after 10 seconds (e.g., if user tries again)
const AUTH_CALLBACK_TIMESTAMP_KEY = 'stirling_auth_callback_ts';

/**
 * OAuth/SAML Callback Handler
 *
 * This component is rendered after OAuth/SAML providers redirect back.
 * The JWT is passed in the URL fragment (#access_token=...) by the Spring backend.
 *
 * Flow:
 * 1. Extract JWT from URL hash
 * 2. Store in localStorage
 * 3. Fire jwt-available event (AuthProvider will validate)
 * 4. Wait for AuthProvider to confirm session
 * 5. Navigate to home only after session is confirmed
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<'extracting' | 'validating' | 'error'>('extracting');
  const [_errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tokenStored, setTokenStored] = useState(false);
  const processingRef = useRef(false);

  // Step 1: Extract and store the token
  useEffect(() => {
    // Check if we've already handled this callback recently (within 10 seconds)
    const handledTimestamp = sessionStorage.getItem(AUTH_CALLBACK_TIMESTAMP_KEY);
    const now = Date.now();
    if (handledTimestamp && (now - parseInt(handledTimestamp, 10)) < 10000) {
      console.debug('[AuthCallback] Already handled recently, checking session state');
      setTokenStored(true);
      setStatus('validating');
      return;
    }

    // Use ref to prevent concurrent processing
    if (processingRef.current) {
      console.debug('[AuthCallback] Already processing, skipping');
      return;
    }
    processingRef.current = true;

    console.log('[AuthCallback] Handling OAuth/SAML callback...');
    console.debug('[AuthCallback] Current URL:', window.location.href);
    console.debug('[AuthCallback] Hash:', window.location.hash);

    // Extract JWT from URL fragment (#access_token=...)
    const hash = window.location.hash.substring(1); // Remove '#'
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');

    if (!token) {
      console.error('[AuthCallback] No access_token in URL fragment');
      console.debug('[AuthCallback] Full hash was:', hash);
      setStatus('error');
      setErrorMessage('Authentication failed - no token received from server.');

      setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: { error: 'OAuth login failed - no token received.' }
        });
      }, 2000);
      return;
    }

    // Mark as handled BEFORE storing token
    sessionStorage.setItem(AUTH_CALLBACK_TIMESTAMP_KEY, now.toString());

    // Store JWT in localStorage
    localStorage.setItem('stirling_jwt', token);
    console.log('[AuthCallback] JWT stored in localStorage');

    // Clear the hash from URL to prevent re-processing on page refresh
    if (window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Update status
    setStatus('validating');

    // Dispatch jwt-available event - AuthProvider will validate the token
    console.log('[AuthCallback] Firing jwt-available event for AuthProvider to validate');
    window.dispatchEvent(new CustomEvent('jwt-available'));

    // Small delay to allow AuthProvider to receive the event and start loading
    // before we set tokenStored (which triggers the session watching effect)
    setTimeout(() => {
      console.log('[AuthCallback] Setting tokenStored=true to start watching session');
      setTokenStored(true);
    }, 50);

    return () => {
      processingRef.current = false;
    };
  }, [navigate]);

  // Step 2: Wait for AuthProvider to validate and provide session
  useEffect(() => {
    if (!tokenStored) {
      return; // Token not stored yet, wait
    }

    console.debug('[AuthCallback] Checking auth state:', {
      authLoading,
      hasSession: !!session,
      tokenStored
    });

    // Still loading - wait for AuthProvider to finish validation
    if (authLoading) {
      return;
    }

    // AuthProvider finished loading
    if (session) {
      // Session validated successfully!
      console.log('[AuthCallback] Session confirmed, user:', session.user?.email);
      console.log('[AuthCallback] Redirecting to home...');
      navigate('/', { replace: true });
    } else {
      // No session after AuthProvider finished - token was invalid
      console.error('[AuthCallback] No session after validation - token may be invalid');

      // Check if JWT is still in localStorage (AuthProvider removes it on 401)
      const jwtStillExists = !!localStorage.getItem('stirling_jwt');
      if (!jwtStillExists) {
        setStatus('error');
        setErrorMessage('Authentication failed - invalid or expired token.');

        setTimeout(() => {
          navigate('/login', {
            replace: true,
            state: { error: 'Authentication failed - please try again.' }
          });
        }, 2000);
      }
      // If JWT still exists but no session, AuthProvider might still be initializing
      // Wait a bit more before giving up
    }
  }, [tokenStored, authLoading, session, navigate]);

  // Timeout: If we've been validating for too long, show error
  useEffect(() => {
    if (status !== 'validating' || !tokenStored) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (!session) {
        setStatus('error');
        setErrorMessage('Authentication timed out. Please try again.');

        setTimeout(() => {
          navigate('/login', {
            replace: true,
            state: { error: 'Authentication timed out. Please try again.' }
          });
        }, 2000);
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeoutId);
  }, [status, tokenStored, session, navigate]);

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
