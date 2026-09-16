import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Group, List, Modal, Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { isSafePostLoginRedirect } from "@app/services/postLoginRedirect";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";
import type { PaygSignupRequiredDetail } from "@app/services/paygErrorInterceptor";

/**
 * Bootstrap that listens for {@code payg:signupRequired} (dispatched by
 * the {@code apiClient} response interceptor when an anonymous user hits
 * a billable endpoint and the server returns {@code 401 SIGNUP_REQUIRED})
 * and opens a Mantine modal explaining the free monthly allowance
 * with a "Sign up free" CTA.
 *
 * <h2>Why an event bus instead of direct render</h2>
 * The {@code apiClient} module is created at app boot, outside the React
 * tree, and can't import JSX. We bridge with a {@code CustomEvent}: the
 * interceptor dispatches, this bootstrap (mounted near the app root)
 * listens and renders, driven by a request-side trigger.
 *
 * <h2>De-duping</h2>
 * If the user fires multiple billable requests in quick succession (e.g.
 * clicking a tool button twice), only one modal opens — the listener
 * ignores the event when the modal is already visible. The modal closes
 * on backdrop click or Escape; we don't gate it on a localStorage flag
 * because this is a deterministic "you need an account" UI, not a one-
 * time onboarding nudge.
 */
export default function SignupRequiredBootstrap() {
  const { t } = useTranslation();
  const { isAnonymous } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [detail, setDetail] = useState<PaygSignupRequiredDetail | null>(null);

  useEffect(() => {
    const handler = (ev: Event) => {
      const incoming = (ev as CustomEvent<PaygSignupRequiredDetail>).detail;
      setDetail((current) => current ?? incoming ?? { category: null });
    };
    window.addEventListener("payg:signupRequired", handler);
    return () => window.removeEventListener("payg:signupRequired", handler);
  }, []);

  useEffect(() => {
    if (!isAnonymous) setDetail(null);
  }, [isAnonymous]);

  const limitReached = detail?.reason === "GUEST_TOOL_LIMIT_REACHED";
  const authenticate = (path: "/signup" | "/login") => {
    const next = location.pathname + location.search + location.hash;
    setDetail(null);
    navigate(
      isSafePostLoginRedirect(next)
        ? `${path}?next=${encodeURIComponent(next)}`
        : path,
    );
  };

  return (
    <Modal
      opened={detail !== null && isAnonymous}
      onClose={() => setDetail(null)}
      withCloseButton
      centered
      size="md"
      radius="lg"
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      title={
        <Text fw={700} size="lg">
          {limitReached
            ? t(
                "payg.signupRequired.guestLimitTitle",
                "Keep going with a free account",
              )
            : t(
                "payg.signupRequired.processorTitle",
                "Unlock Processor with a free account",
              )}
        </Text>
      }
    >
      <Stack gap="md">
        <Text>
          {limitReached
            ? t(
                "payg.signupRequired.guestLimitBody",
                "You've reached your {{count}} free guest tool runs. Log in or create a free account to continue.",
                { count: detail?.limit },
              )
            : t(
                "payg.signupRequired.processorBody",
                "AI, automations and API access require an account. Log in or sign up free to get your Processor allowance.",
              )}
        </Text>
        <List spacing="xs">
          <List.Item>
            {t(
              "payg.signupRequired.manualPromo",
              "Keep using manual PDF tools for free",
            )}
          </List.Item>
          <List.Item>
            {t(
              "payg.signupRequired.aiPromo",
              "Create, edit and ask questions about PDFs with AI",
            )}
          </List.Item>
          <List.Item>
            {t(
              "payg.signupRequired.automationPromo",
              "Try automations and API access with your free Processor allowance",
            )}
          </List.Item>
        </List>
        <Text size="sm" c="dimmed">
          {t(
            "payg.signupRequired.subtext",
            "Creating an account is free and takes a few seconds. No credit card required.",
          )}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="secondary" onClick={() => setDetail(null)}>
            {t("payg.signupRequired.cancel", "Not now")}
          </Button>
          <Button variant="secondary" onClick={() => authenticate("/login")}>
            {t("payg.signupRequired.login", "Log in")}
          </Button>
          <Button
            leftSection={<Icon name="user-plus" size={16} />}
            onClick={() => authenticate("/signup")}
          >
            {t("payg.signupRequired.cta", "Sign up free")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
