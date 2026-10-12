import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useServerExperience } from "@app/hooks/useServerExperience";
import { useAccountLogout } from "@app/extensions/accountLogout";
import { accountService, type AccountData } from "@app/services/accountService";
import apiClient from "@app/services/apiClient";
import { withBasePath } from "@app/constants/app";
import { DEFAULT_RUNTIME_STATE } from "@app/components/onboarding/orchestrator/onboardingConfig";
import StaticOnboardingSlide from "@app/components/onboarding/StaticOnboardingSlide";
import { Button } from "@app/ui/Button";
import { Z_INDEX_ONBOARDING_CARD } from "@app/styles/zIndex";

function requiresMfaSetup(account: AccountData): boolean {
  if (account.mfaEnabled) return false;
  if (account.mfaRequired !== undefined) return account.mfaRequired;
  try {
    const settings: unknown = JSON.parse(account.settings);
    return (
      typeof settings === "object" &&
      settings !== null &&
      "mfaRequired" in settings &&
      String(settings.mfaRequired).toLowerCase() === "true"
    );
  } catch {
    return false;
  }
}

/** Rechecks setup on app entry; deferred backends can supply config without another fetch. */
export function StartupSetup({
  children,
  refreshConfigOnMount = true,
}: {
  children: ReactNode;
  refreshConfigOnMount?: boolean;
}) {
  const { t } = useTranslation();
  const { config, refetch } = useAppConfig();
  const { user, signOut, isAnonymous } = useAuth();
  const { effectiveIsAdmin } = useServerExperience();
  const accountLogout = useAccountLogout();
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsConfigured, setAnalyticsConfigured] = useState(false);
  const [mfaCompleted, setMfaCompleted] = useState(false);
  const loginEnabled = config?.enableLogin === true;

  const requirements = useQuery({
    queryKey: ["startup", "requirements", user?.id, loginEnabled],
    queryFn: async () => {
      // Editor and Processor have separate query caches. Re-read server settings
      // on entry so an analytics choice made in the other app is respected.
      if (refreshConfigOnMount) await refetch();
      if (!loginEnabled || !user || isAnonymous) return null;
      const [account, login] = await Promise.all([
        accountService.getAccountData(),
        accountService.getLoginPageData(),
      ]);
      return { account, login };
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const handleAnalyticsChoice = async (enabled: boolean) => {
    if (analyticsLoading) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    const formData = new FormData();
    formData.append("enabled", String(enabled));
    try {
      await apiClient.post(
        "/api/v1/settings/update-enable-analytics",
        formData,
      );
      await refetch();
      setAnalyticsConfigured(true);
    } catch (error) {
      setAnalyticsError(error instanceof Error ? error.message : String(error));
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handlePasswordChanged = async () => {
    await accountLogout({
      signOut,
      redirectToLogin: () => window.location.assign(withBasePath("/login")),
    });
  };

  if (requirements.isPending || requirements.isFetching) return null;

  if (requirements.isError) {
    return (
      <Modal
        opened
        onClose={() => {}}
        withCloseButton={false}
        closeOnEscape={false}
        closeOnClickOutside={false}
        title={t("common.error", "Error")}
        zIndex={Z_INDEX_ONBOARDING_CARD}
        centered
      >
        <Stack>
          <Text role="alert">{requirements.error.message}</Text>
          <Button onClick={() => void requirements.refetch()}>
            {t("common.retry", "Retry")}
          </Button>
        </Stack>
      </Modal>
    );
  }

  const runtimeState = DEFAULT_RUNTIME_STATE;
  if (
    !analyticsConfigured &&
    effectiveIsAdmin &&
    config?.enableAnalytics == null
  ) {
    return (
      <StaticOnboardingSlide
        key="analytics-choice"
        slideId="analytics-choice"
        runtimeState={runtimeState}
        params={{ analyticsError, analyticsLoading }}
        onSkip={() => {}}
        allowDismiss={false}
        onAction={(action) => {
          if (action === "enable-analytics" || action === "disable-analytics") {
            void handleAnalyticsChoice(action === "enable-analytics");
          }
        }}
      />
    );
  }

  const { account, login } = requirements.data ?? {};
  if (account?.changeCredsFlag) {
    return (
      <StaticOnboardingSlide
        key="first-login"
        slideId="first-login"
        runtimeState={runtimeState}
        params={{
          firstLoginUsername: account.username,
          onPasswordChanged: handlePasswordChanged,
          usingDefaultCredentials: login?.showDefaultCredentials,
        }}
        onSkip={() => {}}
        allowDismiss={false}
        onAction={() => {}}
      />
    );
  }

  if (account && requiresMfaSetup(account) && !mfaCompleted) {
    return (
      <StaticOnboardingSlide
        key="mfa-setup"
        slideId="mfa-setup"
        runtimeState={runtimeState}
        params={{ onMfaSetupComplete: () => setMfaCompleted(true) }}
        onSkip={() => {}}
        allowDismiss={false}
        onAction={() => {}}
      />
    );
  }

  return <>{children}</>;
}
