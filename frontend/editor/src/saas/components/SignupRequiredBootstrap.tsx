import { useEffect, useState, useMemo } from "react";
import { Modal, Stack, Button, Text } from "@mantine/core";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { useTranslation } from "react-i18next";
import { withBasePath } from "@app/constants/app";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";
import type { PaygSignupRequiredDetail } from "@app/services/paygErrorInterceptor";

/**
 * Bootstrap that listens for {@code payg:signupRequired} (dispatched by
 * the {@code apiClient} response interceptor when an anonymous user hits
 * a billable endpoint and the server returns {@code 401 SIGNUP_REQUIRED})
 * and opens a Mantine modal explaining the free 500-op/month allowance
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
  const [opened, setOpened] = useState(false);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<PaygSignupRequiredDetail>).detail;
      // De-dupe: if the modal is already open, the existing copy wins.
      // The user is already being prompted; piling another open call on
      // top would just flicker the same content.
      setOpened((wasOpen) => {
        if (!wasOpen) {
          setCategory(detail?.category ?? null);
        }
        return true;
      });
    };
    window.addEventListener("payg:signupRequired", handler as EventListener);
    return () =>
      window.removeEventListener(
        "payg:signupRequired",
        handler as EventListener,
      );
  }, []);

  // Map the server's gate categories to user-facing nouns. The server
  // returns the FeatureGate name (AI, AUTOMATION, API); the user has
  // no idea what those are in raw form, so we pretty-print here. The
  // fallback "this feature" keeps the modal sensible if the BE adds
  // a category we don't know about.
  const categoryNoun = useMemo(() => {
    switch ((category ?? "").toUpperCase()) {
      case "AI":
        return t("payg.signupRequired.category.ai", "AI features");
      case "AUTOMATION":
        return t("payg.signupRequired.category.automation", "automations");
      case "API":
        return t("payg.signupRequired.category.api", "this tool");
      default:
        return t("payg.signupRequired.category.default", "this feature");
    }
  }, [category, t]);

  const handleSignUp = () => {
    window.location.href = withBasePath("/signup");
  };

  return (
    <Modal
      opened={opened}
      onClose={() => setOpened(false)}
      withCloseButton
      centered
      size="md"
      radius="lg"
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      title={
        <Text fw={700} size="lg">
          {t("payg.signupRequired.title", "Sign up to use {{category}}", {
            category: categoryNoun,
          })}
        </Text>
      }
    >
      <Stack gap="md">
        <Text>
          {t(
            "payg.signupRequired.body",
            "Stirling PDF gives every signed-up account 500 free operations — enough to keep most workflows humming without paying a cent. You're currently using Stirling as a guest, which doesn't include billable tools like AI, automations, or hosted processing.",
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            "payg.signupRequired.subtext",
            "Creating an account is free and takes a few seconds. No credit card required.",
          )}
        </Text>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
          }}
        >
          <Button variant="default" onClick={() => setOpened(false)}>
            {t("payg.signupRequired.cancel", "Not now")}
          </Button>
          <Button
            leftSection={<PersonAddIcon style={{ fontSize: 16 }} />}
            onClick={handleSignUp}
          >
            {t("payg.signupRequired.cta", "Sign up free")}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
