import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, Button, Alert, Loader, Center } from "@mantine/core";
import { DesktopAuthLayout } from "@app/components/SetupWizard/DesktopAuthLayout";
import { SaaSLoginScreen } from "@app/components/SetupWizard/SaaSLoginScreen";
import { SaaSSignupScreen } from "@app/components/SetupWizard/SaaSSignupScreen";
import { ServerSelectionScreen } from "@app/components/SetupWizard/ServerSelectionScreen";
import { SelfHostedLoginScreen } from "@app/components/SetupWizard/SelfHostedLoginScreen";
import {
  ServerConfig,
  SSOProviderConfig,
  connectionModeService,
} from "@app/services/connectionModeService";
import {
  AuthServiceError,
  authService,
  UserInfo,
} from "@app/services/authService";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { STIRLING_SAAS_URL } from "@app/constants/connection";
import { listen } from "@tauri-apps/api/event";
import "@app/routes/authShared/auth.css";
import { DisabledButtonWithTooltip } from "@app/components/shared/DisabledButtonWithTooltip";

enum SetupStep {
  SaaSLogin,
  SaaSSignup,
  ServerSelection,
  SelfHostedLogin,
}

interface SetupWizardProps {
  onComplete: () => void;
  /** Omit the DesktopAuthLayout wrapper — use when rendering inside a modal */
  noLayout?: boolean;
  /** Called when the user dismisses the wizard (modal close button) */
  onClose?: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  onComplete,
  noLayout = false,
  onClose,
}) => {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState<SetupStep>(SetupStep.SaaSLogin);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>({
    url: STIRLING_SAAS_URL,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfHostedMfaCode, setSelfHostedMfaCode] = useState("");
  const [selfHostedMfaRequired, setSelfHostedMfaRequired] = useState(false);
  const [lockConnectionMode, setLockConnectionMode] = useState(false);
  const [lockedServerUnreachable, setLockedServerUnreachable] = useState(false);
  const [lockedServerChecking, setLockedServerChecking] = useState(false);

  const handleSaaSLogin = async (username: string, password: string) => {
    if (!serverConfig) {
      setError("No SaaS server configured");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Only attempt password login if a password is provided
      // If password is empty, assume OAuth login already completed
      const isAlreadyAuthenticated = await authService.isAuthenticated();
      if (!isAlreadyAuthenticated && password) {
        await authService.login(serverConfig.url, username, password);
      }

      await connectionModeService.switchToSaaS(serverConfig.url);
      tauriBackendService.startBackend().catch(console.error);
      onComplete();
    } catch (err) {
      console.error("SaaS login failed:", err);
      setError(err instanceof Error ? err.message : "SaaS login failed");
      setLoading(false);
    }
  };

  const handleSaaSLoginOAuth = async (_userInfo: UserInfo) => {
    if (!serverConfig) {
      setError("No SaaS server configured");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // OAuth already completed by authService.loginWithOAuth
      await connectionModeService.switchToSaaS(serverConfig.url);
      tauriBackendService.startBackend().catch(console.error);
      onComplete();
    } catch (err) {
      console.error("SaaS OAuth login completion failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to complete SaaS login",
      );
      setLoading(false);
    }
  };

  const handleLocalMode = async () => {
    try {
      setLoading(true);
      setError(null);
      // Save the server URL so it pre-fills on reconnect
      if (serverConfig?.url) {
        localStorage.setItem("server_url", serverConfig.url);
      }
      await connectionModeService.switchToLocal();
      tauriBackendService.startBackend().catch(console.error);
      onComplete();
    } catch (err) {
      console.error("Failed to continue in local mode:", err);
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const handleSelfHostedClick = () => {
    if (lockConnectionMode) {
      return;
    }
    setError(null);
    setActiveStep(SetupStep.ServerSelection);
  };

  const handleSwitchToSignup = () => {
    setError(null);
    setActiveStep(SetupStep.SaaSSignup);
  };

  const handleSwitchToLogin = () => {
    setError(null);
    setActiveStep(SetupStep.SaaSLogin);
  };

  const handleServerSelection = (config: ServerConfig) => {
    console.log("[SetupWizard] Server selected:", config);
    console.log("[SetupWizard] OAuth providers:", config.enabledOAuthProviders);
    console.log("[SetupWizard] Login method:", config.loginMethod);
    setServerConfig(config);
    setError(null);
    setSelfHostedMfaCode("");
    setSelfHostedMfaRequired(false);
    setActiveStep(SetupStep.SelfHostedLogin);
  };

  const handleSelfHostedLogin = async (username: string, password: string) => {
    console.log("[SetupWizard] 🔐 Starting self-hosted login");
    console.log(`[SetupWizard] Server: ${serverConfig?.url}`);
    console.log(`[SetupWizard] Username: ${username}`);

    if (!serverConfig) {
      console.error("[SetupWizard] ❌ No server configured");
      setError("No server configured");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log("[SetupWizard] Step 1: Authenticating with server...");
      const trimmedMfa = selfHostedMfaCode.trim();
      const mfaCode = trimmedMfa ? trimmedMfa : undefined;
      await authService.login(serverConfig.url, username, password, mfaCode);
      console.log("[SetupWizard] ✅ Authentication successful");

      setSelfHostedMfaRequired(false);
      setSelfHostedMfaCode("");

      console.log("[SetupWizard] Step 2: Switching to self-hosted mode...");
      await connectionModeService.switchToSelfHosted(serverConfig);
      console.log("[SetupWizard] ✅ Switched to self-hosted mode");

      console.log("[SetupWizard] Step 3: Initializing external backend...");
      await tauriBackendService.initializeExternalBackend();
      console.log("[SetupWizard] ✅ External backend initialized");

      console.log("[SetupWizard] ✅ Setup complete, calling onComplete()");
      onComplete();
    } catch (err) {
      console.error("[SetupWizard] ❌ Self-hosted login failed:", err);
      let errorMessage = "Self-hosted login failed";
      if (err instanceof AuthServiceError) {
        if (err.code === "mfa_required" || err.code === "invalid_mfa_code") {
          setSelfHostedMfaRequired(true);
        }
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      }
      if (
        errorMessage.toLowerCase().includes("mfa_required") ||
        errorMessage.toLowerCase().includes("invalid_mfa_code")
      ) {
        setSelfHostedMfaRequired(true);
      }
      console.error("[SetupWizard] Error message:", errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleSelfHostedOAuthSuccess = async (_userInfo: UserInfo) => {
    console.log("[SetupWizard] 🔐 OAuth login successful, completing setup");
    console.log(`[SetupWizard] Server: ${serverConfig?.url}`);

    if (!serverConfig) {
      console.error("[SetupWizard] ❌ No server configured");
      setError("No server configured");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log("[SetupWizard] Step 1: OAuth already completed");
      console.log("[SetupWizard] Step 2: Switching to self-hosted mode...");
      await connectionModeService.switchToSelfHosted(serverConfig);
      console.log("[SetupWizard] ✅ Switched to self-hosted mode");

      console.log("[SetupWizard] Step 3: Initializing external backend...");
      await tauriBackendService.initializeExternalBackend();
      console.log("[SetupWizard] ✅ External backend initialized");

      console.log("[SetupWizard] ✅ Setup complete, calling onComplete()");
      onComplete();
    } catch (err) {
      console.error(
        "[SetupWizard] ❌ Self-hosted OAuth login completion failed:",
        err,
      );
      const errorMessage =
        err instanceof Error ? err.message : "Failed to complete login";
      console.error("[SetupWizard] Error message:", errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribePromise = listen<string>("deep-link", async (event) => {
      const url = event.payload;
      if (!url) return;

      try {
        const parsed = new URL(url);

        // Supabase sends tokens in the URL hash
        const hash = parsed.hash.replace(/^#/, "");
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const type = params.get("type") || parsed.searchParams.get("type");
        // Self-hosted SSO deep links are normally handled by authService.loginWithSelfHostedOAuth.
        // Fallback here only if no in-flight auth listener exists (e.g. renderer reload mid-flow).
        if (type === "sso" || type === "sso-selfhosted") {
          if (authService.isSelfHostedDeepLinkFlowActive()) {
            return;
          }

          const accessTokenFromHash = params.get("access_token");
          const accessTokenFromQuery = parsed.searchParams.get("access_token");
          const serverFromQuery = parsed.searchParams.get("server");
          const token = accessTokenFromHash || accessTokenFromQuery;
          const serverUrl =
            serverFromQuery || serverConfig?.url || STIRLING_SAAS_URL;
          if (!token || !serverUrl) {
            console.error(
              "[SetupWizard] Deep link missing token or server for SSO completion",
            );
            return;
          }

          setLoading(true);
          setError(null);

          await authService.completeSelfHostedSession(serverUrl, token);
          await connectionModeService.switchToSelfHosted({ url: serverUrl });
          await tauriBackendService.initializeExternalBackend();
          onComplete();
          return;
        }

        if (
          !type ||
          (type !== "signup" && type !== "recovery" && type !== "magiclink")
        ) {
          return;
        }

        if (!accessToken) {
          console.error("[SetupWizard] Deep link missing access_token");
          return;
        }

        setLoading(true);
        setError(null);

        await authService.completeSupabaseSession(
          accessToken,
          serverConfig?.url || STIRLING_SAAS_URL,
        );
        await connectionModeService.switchToSaaS(
          serverConfig?.url || STIRLING_SAAS_URL,
        );
        tauriBackendService.startBackend().catch(console.error);
        onComplete();
      } catch (err) {
        console.error("[SetupWizard] Failed to handle deep link", err);
        setError(
          err instanceof Error ? err.message : "Failed to complete signup",
        );
        setLoading(false);
      }
    });

    return () => {
      void unsubscribePromise.then((unsub) => unsub());
    };
  }, [onComplete, serverConfig?.url]);

  const handleBack = () => {
    if (lockConnectionMode) {
      return;
    }
    setError(null);
    if (activeStep === SetupStep.SelfHostedLogin) {
      setSelfHostedMfaCode("");
      setSelfHostedMfaRequired(false);
      setActiveStep(SetupStep.ServerSelection);
    } else if (activeStep === SetupStep.ServerSelection) {
      setActiveStep(SetupStep.SaaSLogin);
      setServerConfig({ url: STIRLING_SAAS_URL });
    } else if (activeStep === SetupStep.SaaSSignup) {
      setActiveStep(SetupStep.SaaSLogin);
    }
  };

  const loadLockedConfig = useCallback(async () => {
    const currentConfig = await connectionModeService.getCurrentConfig();
    if (!currentConfig.lock_connection_mode) return;
    const serverUrl = currentConfig.server_config?.url;
    if (!serverUrl) return;

    setLockConnectionMode(true);
    setLockedServerUnreachable(false);
    setLockedServerChecking(true);

    const savedUrl = serverUrl.replace(/\/+$/, "");
    let updatedConfig: ServerConfig = {
      ...(currentConfig.server_config ?? { url: savedUrl }),
    };

    try {
      const response = await fetch(
        `${savedUrl}/api/v1/proprietary/ui-data/login`,
      );

      if (response.ok) {
        const data = await response.json();
        const enabledProviders: SSOProviderConfig[] = [];
        const providerEntries = Object.entries(data.providerList || {});

        providerEntries.forEach(([path, label]) => {
          const id = path.split("/").pop();
          if (id) {
            enabledProviders.push({
              id,
              path,
              label: typeof label === "string" ? label : undefined,
            });
          }
        });

        updatedConfig = {
          ...updatedConfig,
          enabledOAuthProviders:
            enabledProviders.length > 0 ? enabledProviders : undefined,
          loginMethod: data.loginMethod || "all",
        };

        setServerConfig(updatedConfig);
        setLockedServerChecking(false);
        setActiveStep(SetupStep.SelfHostedLogin);
      } else {
        // Server responded but with an error — still show login form
        updatedConfig = { ...updatedConfig, loginMethod: "all" };
        setServerConfig(updatedConfig);
        setLockedServerChecking(false);
        setActiveStep(SetupStep.SelfHostedLogin);
      }
    } catch (err) {
      // Network error — server is unreachable
      console.error("[SetupWizard] Server unreachable:", err);
      setServerConfig(updatedConfig);
      setLockedServerChecking(false);
      setLockedServerUnreachable(true);
      setActiveStep(SetupStep.SelfHostedLogin);
    }
  }, []);

  useEffect(() => {
    void loadLockedConfig();
  }, [loadLockedConfig]);

  const wizardContent = (
    <>
      {/* Step Content */}
      {!lockConnectionMode && activeStep === SetupStep.SaaSLogin && (
        <SaaSLoginScreen
          serverUrl={serverConfig?.url || STIRLING_SAAS_URL}
          onLogin={handleSaaSLogin}
          onOAuthSuccess={handleSaaSLoginOAuth}
          onSelfHostedClick={handleSelfHostedClick}
          onSwitchToSignup={handleSwitchToSignup}
          onSkipSignIn={handleLocalMode}
          onClose={onClose}
          loading={loading}
          error={error}
        />
      )}

      {!lockConnectionMode && activeStep === SetupStep.SaaSSignup && (
        <SaaSSignupScreen
          loading={loading}
          error={error}
          onLogin={handleSaaSLogin}
          onSwitchToLogin={handleSwitchToLogin}
        />
      )}

      {!lockConnectionMode && activeStep === SetupStep.ServerSelection && (
        <ServerSelectionScreen
          onSelect={handleServerSelection}
          loading={loading}
          error={error}
        />
      )}

      {lockConnectionMode && lockedServerChecking && (
        <Center py="xl">
          <Loader size="md" />
        </Center>
      )}

      {activeStep === SetupStep.SelfHostedLogin &&
        lockedServerUnreachable &&
        !lockedServerChecking && (
          <Stack gap="md" style={{ padding: "0.5rem 0" }}>
            <Alert
              color="orange"
              title={t(
                "setup.selfhosted.unreachable.title",
                "Cannot connect to server",
              )}
            >
              <Text size="sm">
                {t(
                  "setup.selfhosted.unreachable.message",
                  "Could not reach {{url}}. Check that the server is running and accessible.",
                  {
                    url: serverConfig?.url,
                  },
                )}
              </Text>
            </Alert>
            <Button
              variant="filled"
              color="blue"
              fullWidth
              loading={loading}
              onClick={() => void loadLockedConfig()}
            >
              {t("setup.selfhosted.unreachable.retry", "Retry")}
            </Button>
            {lockConnectionMode ? (
              <DisabledButtonWithTooltip
                tooltip={t(
                  "setup.selfhosted.changeServerLocked",
                  "Your organisation has restricted this app to a specific server",
                )}
              >
                {t(
                  "setup.selfhosted.unreachable.changeServer",
                  "Connect to a different server",
                )}
              </DisabledButtonWithTooltip>
            ) : (
              <Button
                variant="light"
                color="blue"
                fullWidth
                loading={loading}
                onClick={() => {
                  setLockedServerUnreachable(false);
                  setActiveStep(SetupStep.ServerSelection);
                }}
              >
                {t(
                  "setup.selfhosted.unreachable.changeServer",
                  "Connect to a different server",
                )}
              </Button>
            )}
            <Button
              variant="subtle"
              color="white"
              fullWidth
              onClick={handleLocalMode}
            >
              {t(
                "setup.selfhosted.unreachable.continueOffline",
                "Use local tools instead",
              )}
            </Button>
          </Stack>
        )}

      {activeStep === SetupStep.SelfHostedLogin &&
        !lockedServerUnreachable &&
        !lockedServerChecking && (
          <>
            <SelfHostedLoginScreen
              serverUrl={serverConfig?.url || ""}
              enabledOAuthProviders={serverConfig?.enabledOAuthProviders}
              loginMethod={serverConfig?.loginMethod}
              onLogin={handleSelfHostedLogin}
              onOAuthSuccess={handleSelfHostedOAuthSuccess}
              mfaCode={selfHostedMfaCode}
              setMfaCode={setSelfHostedMfaCode}
              requiresMfa={selfHostedMfaRequired}
              loading={loading}
              error={error}
            />
            <div
              className="navigation-link-container"
              style={{ marginTop: "1.5rem" }}
            >
              <button
                type="button"
                onClick={handleLocalMode}
                className="navigation-link-button"
                disabled={loading}
              >
                {t("setup.selfhosted.switchToLocal", "Use local tools instead")}
              </button>
            </div>
          </>
        )}

      {/* Back Button */}
      {!lockConnectionMode && activeStep > SetupStep.SaaSLogin && !loading && (
        <div
          className="navigation-link-container"
          style={{ marginTop: "1.5rem" }}
        >
          <button
            type="button"
            onClick={handleBack}
            className="navigation-link-button"
          >
            {t("common.back", "Back")}
          </button>
        </div>
      )}
    </>
  );

  if (noLayout) {
    return <div style={{ padding: "2rem" }}>{wizardContent}</div>;
  }

  return <DesktopAuthLayout>{wizardContent}</DesktopAuthLayout>;
};
