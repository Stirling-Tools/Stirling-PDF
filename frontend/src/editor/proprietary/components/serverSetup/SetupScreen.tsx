import type { ReactNode } from "react";
import { FocusTrap } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AuthShell } from "@editor/auth/ui/AuthShell";
import { Z_INDEX_ONBOARDING_CARD } from "@editor/styles/zIndex";
import { SetupStepFrame } from "@editor/components/serverSetup/SetupStepFrame";
import styles from "@editor/components/shared/setupCard/SetupCard.module.css";

/**
 * Covers the whole app as a modal: setup runs before anything else is usable,
 * so focus stays inside it and the app shell around it (banners, toasts) is
 * out of reach until it closes.
 */
export function SetupScreen({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={styles.screen} style={{ zIndex: Z_INDEX_ONBOARDING_CARD }}>
      <FocusTrap active>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("serverSetup.dialogLabel", "Server setup")}
        >
          {/* Medium: a default OAuth redirect URI and the longest sign-in method fit on one line. */}
          <AuthShell size="medium">{children}</AuthShell>
        </div>
      </FocusTrap>
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
        primaryLabel={t("serverSetup.signingIn.button", "Signing in")}
        onPrimary={() => {}}
        primaryLoading
      />
    </SetupScreen>
  );
}
