import { useEffect, useMemo, useRef, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { Text, Stack, Alert } from "@mantine/core";
import { setPostLoginRedirectPath } from "@shared/auth/spring/springAuthClient";
import { useAuth } from "@app/auth/UseSession";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useTranslation } from "react-i18next";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import { useBackendProbe } from "@app/hooks/useBackendProbe";
import { BASE_PATH, withBasePath } from "@app/constants/app";
import { updateSupportedLanguages } from "@app/i18n";
import {
  DEBUG_SHOW_ALL_PROVIDERS,
  oauthProviderConfig,
} from "@shared/auth/ui/OAuthButtons";
import SpringLoginForm from "@shared/auth/ui/SpringLoginForm";
import { useSpringLogin } from "@shared/auth/ui/useSpringLogin";
import LoggedInState from "@app/routes/login/LoggedInState";
import loginHeader from "@shared/assets/login/LoginLightModeHeader.svg";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { session, loading } = useAuth();
  const resolveReturnPath = (): string | null => {
    const fromState = (
      location.state as { from?: { pathname?: string } } | null
    )?.from?.pathname;
    if (fromState) return fromState;
    const fromQuery = searchParams.get("from");
    if (!fromQuery) return null;
    try {
      return decodeURIComponent(fromQuery);
    } catch {
      return fromQuery;
    }
  };
  const { refetch } = useAppConfig();
  const { t } = useTranslation();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [_enableLogin, setEnableLogin] = useState<boolean | null>(null);
  const [ssoAutoLogin, setSsoAutoLogin] = useState(false);
  const [hasSSOProviders, setHasSSOProviders] = useState(false);
  const backendProbe = useBackendProbe();
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  const [showDefaultCredentials, setShowDefaultCredentials] = useState(false);
  const loginDisabled =
    backendProbe.loginDisabled === true || _enableLogin === false;
  const autoLoginAttempted = useRef(false);
  const autoLoginErrorRecorded = useRef(false);

  const AUTO_LOGIN_ATTEMPTS_KEY = "stirling_sso_auto_login_attempts";
  const AUTO_LOGIN_ERRORS_KEY = "stirling_sso_auto_login_errors";
  const AUTO_LOGIN_LOGOUT_KEY = "stirling_sso_auto_login_logged_out";
  const MAX_AUTO_LOGIN_ATTEMPTS = 2;
  const MAX_AUTO_LOGIN_ERRORS = 1;

  const readSessionNumber = (key: string) => {
    if (typeof window === "undefined") {
      return 0;
    }
    const raw = window.sessionStorage.getItem(key);
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  };

  const writeSessionNumber = (key: string, value: number) => {
    if (typeof window === "undefined") {
      return;
    }
    window.sessionStorage.setItem(key, String(value));
  };

  const hasLogoutBlock = () => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.sessionStorage.getItem(AUTO_LOGIN_LOGOUT_KEY) === "1";
  };

  const clearLogoutBlock = () => {
    if (typeof window === "undefined") {
      return;
    }
    window.sessionStorage.removeItem(AUTO_LOGIN_LOGOUT_KEY);
  };

  const recordAutoLoginAttempt = () => {
    const attempts = readSessionNumber(AUTO_LOGIN_ATTEMPTS_KEY);
    writeSessionNumber(AUTO_LOGIN_ATTEMPTS_KEY, attempts + 1);
  };

  const recordAutoLoginError = () => {
    const errors = readSessionNumber(AUTO_LOGIN_ERRORS_KEY);
    writeSessionNumber(AUTO_LOGIN_ERRORS_KEY, errors + 1);
  };

  const errorFromState = (location.state as { error?: string } | null)?.error;
  const errorFromQuery = useMemo(() => {
    if (!searchParams) {
      return null;
    }
    const errorParamKeys = [
      "error",
      "error_description",
      "error_code",
      "sso_error",
      "oauth_error",
      "saml_error",
      "login_error",
    ];
    for (const key of errorParamKeys) {
      const value = searchParams.get(key);
      if (value) {
        return value;
      }
    }
    for (const [key, value] of searchParams.entries()) {
      if (key.toLowerCase().includes("error")) {
        return value || "Single sign-on failed. Please try again.";
      }
    }
    return null;
  }, [searchParams]);

  const hasSsoLoginError = Boolean(errorFromState || errorFromQuery);

  // Shared login state + sign-in handlers + provider fetch. Editor-specific
  // behaviour (auto-login, redirects, first-time setup) is layered on here.
  const login = useSpringLogin({
    ready: backendProbe.status === "up" || backendProbe.loginDisabled,
    redirectTo: `${BASE_PATH}/auth/callback`,
    onSignInStart: clearLogoutBlock,
    onBeforeOAuth: () => {
      // Don't overwrite a path already stashed by httpErrorHandler on a 401.
      const returnPath = resolveReturnPath();
      if (returnPath) {
        setPostLoginRedirectPath(returnPath);
      }
    },
    onConfigLoaded: (data) => {
      // If login is disabled, redirect to home (anonymous mode)
      if (data.enableLogin === false) {
        console.debug("[Login] Login disabled, redirecting to home");
        navigate("/");
        return;
      }
      setEnableLogin(data.enableLogin ?? true);
      setSsoAutoLogin(Boolean(data.ssoAutoLogin));
      setIsFirstTimeSetup(data.firstTimeSetup ?? false);
      setShowDefaultCredentials(data.showDefaultCredentials ?? false);
      // Apply language configuration from server
      if (data.languages || data.defaultLocale) {
        updateSupportedLanguages(data.languages, data.defaultLocale);
      }
    },
  });

  const isUserPassAllowed = login.isUserPassAllowed;
  const isSsoOnlyMode = !login.isUserPassAllowed;

  // Periodically probe while backend isn't up so the screen can auto-advance when it comes online
  useEffect(() => {
    if (backendProbe.status === "up" || backendProbe.loginDisabled) {
      return;
    }
    const tick = async () => {
      const result = await backendProbe.probe();
      if (result.status === "up") {
        await refetch();
        if (loginDisabled) {
          navigate("/", { replace: true });
        }
      }
    };
    const intervalId = window.setInterval(() => {
      void tick();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [
    backendProbe.status,
    backendProbe.loginDisabled,
    backendProbe.probe,
    refetch,
    navigate,
    loginDisabled,
  ]);

  // Redirect immediately if user has valid session (JWT already validated by AuthProvider)
  useEffect(() => {
    if (!loading && session) {
      const returnPath = resolveReturnPath();
      console.debug("[Login] User already authenticated, redirecting to home", {
        returnPath,
      });
      navigate(returnPath || "/", { replace: true });
    }
  }, [session, loading, navigate, location.state, searchParams]);

  // If backend reports login is disabled, redirect to home (anonymous mode)
  useEffect(() => {
    if (backendProbe.loginDisabled) {
      // Slight delay to allow state updates before redirecting
      const id = setTimeout(() => navigate("/", { replace: true }), 0);
      return () => clearTimeout(id);
    }
  }, [backendProbe.loginDisabled, navigate]);

  useEffect(() => {
    if (backendProbe.status === "up") {
      void refetch();
    }
  }, [backendProbe.status, refetch]);

  // Update hasSSOProviders and showEmailForm when providers or loginMethod change
  useEffect(() => {
    // In debug mode, check if any providers exist in the config
    const hasProviders = DEBUG_SHOW_ALL_PROVIDERS
      ? Object.keys(oauthProviderConfig).length > 0
      : login.providers.length > 0;
    setHasSSOProviders(hasProviders);

    // Check if username/password authentication is allowed
    const userPassAllowed =
      login.loginMethod === "all" || login.loginMethod === "normal";

    // Show email form if no SSO providers exist AND username/password is allowed
    if (!hasProviders && userPassAllowed) {
      setShowEmailForm(true);
    } else if (!userPassAllowed) {
      // Hide email form if username/password auth is not allowed
      setShowEmailForm(false);
    }
  }, [login.providers, login.loginMethod]);

  // Auto-login to SSO when enabled and only one SSO option exists
  useEffect(() => {
    if (autoLoginAttempted.current) {
      return;
    }

    const attempts = readSessionNumber(AUTO_LOGIN_ATTEMPTS_KEY);
    const errors = readSessionNumber(AUTO_LOGIN_ERRORS_KEY);
    const blockedByErrors = errors >= MAX_AUTO_LOGIN_ERRORS;
    const blockedByAttempts = attempts >= MAX_AUTO_LOGIN_ATTEMPTS;
    const blockedByLogout = hasLogoutBlock();

    if (
      !ssoAutoLogin ||
      loginDisabled ||
      loading ||
      session ||
      backendProbe.status !== "up"
    ) {
      return;
    }

    if (
      hasSsoLoginError ||
      blockedByErrors ||
      blockedByAttempts ||
      blockedByLogout
    ) {
      return;
    }

    if (login.isUserPassAllowed) {
      return;
    }

    if (login.providers.length !== 1) {
      return;
    }

    autoLoginAttempted.current = true;
    recordAutoLoginAttempt();
    void login.signInWithProvider(login.providers[0]);
  }, [
    ssoAutoLogin,
    loginDisabled,
    loading,
    session,
    backendProbe.status,
    login.loginMethod,
    login.providers,
    login.signInWithProvider,
    login.isUserPassAllowed,
    hasSsoLoginError,
  ]);

  // Handle query params (email prefill, success messages, and session expiry)
  useEffect(() => {
    try {
      const emailFromQuery = searchParams.get("email");
      if (emailFromQuery) {
        login.setEmail(emailFromQuery);
      }

      // Check if session expired (401 redirect)
      const expired = searchParams.get("expired");
      if (expired === "true") {
        login.setError(
          t(
            "login.sessionExpired",
            "Your session has expired. Please sign in again.",
          ),
        );
      }

      const messageType = searchParams.get("messageType");
      if (messageType) {
        switch (messageType) {
          case "accountCreated":
            setSuccessMessage(
              t(
                "login.accountCreatedSuccess",
                "Account created successfully! You can now sign in.",
              ),
            );
            break;
          case "passwordChanged":
            setSuccessMessage(
              t(
                "login.passwordChangedSuccess",
                "Password changed successfully! Please sign in with your new password.",
              ),
            );
            break;
          case "credsUpdated":
            setSuccessMessage(
              t(
                "login.credentialsUpdated",
                "Your credentials have been updated. Please sign in again.",
              ),
            );
            break;
        }
      }

      if (errorFromState) {
        login.setError(errorFromState);
      } else if (errorFromQuery) {
        login.setError(errorFromQuery);
      }

      if (hasSsoLoginError && !autoLoginErrorRecorded.current) {
        recordAutoLoginError();
        autoLoginErrorRecorded.current = true;
      }
    } catch (_) {
      // ignore
    }
  }, [
    searchParams,
    t,
    errorFromState,
    errorFromQuery,
    hasSsoLoginError,
    login.setEmail,
    login.setError,
  ]);

  const baseUrl = window.location.origin + BASE_PATH;

  // Set document meta
  useDocumentMeta({
    title: `${t("login.title", "Sign in")} - Stirling PDF`,
    description: t(
      "app.description",
      "The Free Adobe Acrobat alternative (10M+ Downloads)",
    ),
    ogTitle: `${t("login.title", "Sign in")} - Stirling PDF`,
    ogDescription: t(
      "app.description",
      "The Free Adobe Acrobat alternative (10M+ Downloads)",
    ),
    ogImage: `${baseUrl}/og_images/home.png`,
    ogUrl: `${window.location.origin}${window.location.pathname}`,
  });

  // If login is disabled, short-circuit to home (avoids rendering the form after retry)
  if (loginDisabled) {
    return <Navigate to="/" replace />;
  }

  // Show logged in state if authenticated
  if (session && !loading) {
    return <LoggedInState />;
  }

  // If backend isn't ready yet, show a lightweight status screen instead of the form
  if (backendProbe.status !== "up" && !loginDisabled) {
    const handleRetry = async () => {
      const result = await backendProbe.probe();
      if (result.status === "up") {
        await refetch();
        navigate("/", { replace: true });
      }
    };
    return (
      <AuthLayout>
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
        <div
          className="auth-section"
          style={{
            padding: "1.5rem",
            marginTop: "1rem",
            borderRadius: "0.75rem",
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            border: "1px solid rgba(37, 99, 235, 0.2)",
          }}
        >
          <p style={{ margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
            {t(
              "backendStartup.unreachable",
              "The application cannot currently connect to the backend. Verify the backend status and network connectivity, then try again.",
            )}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="auth-cta-button px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold mt-5 border-0 cursor-pointer"
            style={{ width: "fit-content" }}
          >
            {t("backendStartup.retry", "Retry")}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <SpringLoginForm
        state={login}
        logoSrc={loginHeader}
        logoDarkSrc={withBasePath("/modern-logo/LoginDarkModeHeader.svg")}
        showEmailForm={showEmailForm}
        oauthCtaPrefix={
          isSsoOnlyMode ? t("login.signInWith", "Sign in with") : undefined
        }
        oauthUseNewStyle={isSsoOnlyMode}
        aboveError={
          successMessage ? (
            <div
              style={{
                padding: "1rem",
                marginBottom: "1rem",
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "0.5rem",
                color: "#16a34a",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  textAlign: "center",
                }}
              >
                {successMessage}
              </p>
            </div>
          ) : undefined
        }
        beforeEmailForm={
          hasSSOProviders && !showEmailForm && isUserPassAllowed ? (
            <div className="auth-section">
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                disabled={login.isSubmitting}
                className="w-full px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold mb-2 cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed auth-cta-button"
              >
                {t("login.useEmailInstead", "Login with email")}
              </button>
            </div>
          ) : undefined
        }
        footer={
          isFirstTimeSetup && showDefaultCredentials && isUserPassAllowed ? (
            <Alert color="blue" variant="light" radius="md" mt="xl">
              <Stack gap="xs" align="center">
                <Text
                  size="sm"
                  fw={600}
                  ta="center"
                  style={{ color: "var(--text-always-dark)" }}
                >
                  {t("login.defaultCredentials", "Default Login Credentials")}
                </Text>
                <Text
                  size="sm"
                  ta="center"
                  style={{ color: "var(--text-always-dark)" }}
                >
                  <Text
                    component="span"
                    fw={600}
                    style={{ color: "var(--text-always-dark)" }}
                  >
                    {t("login.username", "Username")}:
                  </Text>{" "}
                  admin
                </Text>
                <Text
                  size="sm"
                  ta="center"
                  style={{ color: "var(--text-always-dark)" }}
                >
                  <Text
                    component="span"
                    fw={600}
                    style={{ color: "var(--text-always-dark)" }}
                  >
                    {t("login.password", "Password")}:
                  </Text>{" "}
                  stirling
                </Text>
                <Text
                  size="xs"
                  ta="center"
                  mt="xs"
                  style={{ color: "var(--text-always-dark-muted)" }}
                >
                  {t(
                    "login.changePasswordWarning",
                    "Please change your password after logging in for the first time",
                  )}
                </Text>
              </Stack>
            </Alert>
          ) : undefined
        }
      />
    </AuthLayout>
  );
}
