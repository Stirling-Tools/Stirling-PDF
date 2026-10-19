import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AuthShell } from "@app/auth/ui/AuthShell";
import { Z_INDEX_ONBOARDING_CARD } from "@app/styles/zIndex";
import { SetupStepFrame } from "@app/components/serverSetup/SetupStepFrame";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";

/** Covers the whole app: setup runs before anything else is usable. */
export function SetupScreen({ children }: { children: ReactNode }) {
  return (
    <div className={styles.screen} style={{ zIndex: Z_INDEX_ONBOARDING_CARD }}>
      <AuthShell>{children}</AuthShell>
    </div>
  );
}

/**
 * The card shown from the automatic first sign-in until setup's first card is
 * ready. The login page, the app's config load and the wizard's settings load
 * each render it in turn, so the hand-off reads as one card, not three screens.
 */
export function SetupSignInScreen() {
  const { t } = useTranslation();
  return (
    <SetupScreen>
      <SetupStepFrame
        title={t(
          "serverSetup.signingIn.title",
          "Signing in with default credentials",
        )}
        subtitle={t(
          "serverSetup.signingIn.subtitle",
          "You'll choose your own next.",
        )}
        primaryLabel={t("serverSetup.signingIn.button", "Signing in")}
        onPrimary={() => {}}
        primaryLoading
      />
    </SetupScreen>
  );
}
