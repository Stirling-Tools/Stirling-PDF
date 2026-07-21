import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  consumePostLoginRedirectPath,
  springAuth,
} from "@app/auth/spring/springAuthClient";
import { markLoginLandingPending } from "@app/utils/loginLanding";
import { handleAuthCallbackSuccess } from "@app/extensions/authCallback";
import { AuthShell } from "@app/auth/ui/AuthShell";
import { Spinner } from "@app/ui/Spinner";
import { withBasePath } from "@app/constants/app";
import "@app/auth/ui/auth.css";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";
import i18n from "@app/i18n";

/**
 * OAuth Callback Handler
 *
 * This component is rendered after OAuth providers (GitHub, Google, etc.) redirect back.
 * The JWT is passed in the URL fragment (#access_token=...) by the Spring backend.
 * We extract it, store in localStorage, and redirect to the home page.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
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
          state: {
            error: i18n.t(
              "auth.callback.signedOut",
              "You have been signed out. Please sign in again.",
            ),
          },
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
            state: {
              error: i18n.t(
                "auth.callback.missingToken",
                "OAuth login failed - no token received.",
              ),
            },
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
            state: {
              error: i18n.t(
                "auth.callback.invalidToken",
                "OAuth login failed - invalid token.",
              ),
            },
          });
          return;
        }

        await handleAuthCallbackSuccess(token);

        // Wait for all context providers to process jwt-available event
        // This prevents infinite render loop when coming from cross-domain SAML redirect
        await new Promise((resolve) => setTimeout(resolve, 100));

        const target = consumePostLoginRedirectPath() ?? "/";
        // Fresh OAuth/SSO login with no explicit destination: let the role-based
        // landing route processor users.
        if (target === "/") markLoginLandingPending();
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
          state: {
            error: i18n.t(
              "auth.callback.oauthFailed",
              "OAuth login failed. Please try again.",
            ),
          },
        });
      }
    };

    handleCallback();
  }, []); // Empty deps - only run once on mount. navigate is stable, processingRef prevents double execution

  return (
    <AuthShell>
      <div className="auth-logo-block">
        <img
          src={loginHeader}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--light"
        />
        <img
          src={withBasePath("/modern-logo/LoginDarkModeHeader.svg")}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--dark"
        />
      </div>
      <h1 className="login-title" style={{ textAlign: "center" }}>
        {t("auth.callback.completing", "Completing authentication")}
      </h1>
      <p className="login-subtitle" style={{ textAlign: "center" }}>
        {t(
          "auth.callback.pleaseWait",
          "Please wait while we finish signing you in.",
        )}
      </p>
      <div
        style={{ display: "flex", justifyContent: "center", margin: "1rem 0" }}
      >
        <Spinner size="md" />
      </div>
      <p className="login-subtitle" style={{ textAlign: "center" }}>
        {t(
          "auth.callback.windowMayClose",
          "You can close this window once it completes.",
        )}
      </p>
    </AuthShell>
  );
}
