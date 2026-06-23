import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  consumePostLoginRedirectPath,
  springAuth,
} from "@shared/auth/spring/springAuthClient";
import { handleAuthCallbackSuccess } from "@app/extensions/authCallback";
import styles from "@app/routes/AuthCallback.module.css";

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

  useEffect(() => {
    const startedAt = performance.now();
    const elapsed = () => `${(performance.now() - startedAt).toFixed(0)}ms`;

    const handleCallback = async () => {
      if (
        typeof window !== "undefined" &&
        window.sessionStorage.getItem("stirling_sso_auto_login_logged_out") ===
          "1"
      ) {
        navigate("/login", {
          replace: true,
          state: { error: "You have been signed out. Please sign in again." },
        });
        return;
      }

      // Prevent double execution (React 18 Strict Mode + navigate dependency)
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        const hash = window.location.hash.substring(1);
        const token = new URLSearchParams(hash).get("access_token");

        if (!token) {
          console.error(
            `[AuthCallback] No access_token in URL fragment (${elapsed()})`,
          );
          navigate("/login", {
            replace: true,
            state: { error: "OAuth login failed - no token received." },
          });
          return;
        }

        localStorage.setItem("stirling_jwt", token);
        window.dispatchEvent(new CustomEvent("jwt-available"));

        const { data, error } = await springAuth.getSession();
        if (error || !data.session) {
          console.error(
            `[AuthCallback] Failed to validate token (${elapsed()}):`,
            error,
          );
          localStorage.removeItem("stirling_jwt");
          navigate("/login", {
            replace: true,
            state: { error: "OAuth login failed - invalid token." },
          });
          return;
        }

        await handleAuthCallbackSuccess(token);

        // Wait for all context providers to process jwt-available event
        // This prevents infinite render loop when coming from cross-domain SAML redirect
        await new Promise((resolve) => setTimeout(resolve, 100));

        const target = consumePostLoginRedirectPath() ?? "/";
        console.info(
          `[AuthCallback] Authenticated ${data.session.user.username} in ${elapsed()}, navigating to ${target}`,
        );
        navigate(target, { replace: true });
      } catch (error) {
        console.error(
          `[AuthCallback] Authentication failed (${elapsed()}):`,
          error,
        );
        navigate("/login", {
          replace: true,
          state: { error: "OAuth login failed. Please try again." },
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
        <div className={styles.message}>
          Please wait while we finish signing you in.
        </div>
        <div className={styles.loadingExtra}>
          You can close this window once it completes.
        </div>
      </div>
    </div>
  );
}
