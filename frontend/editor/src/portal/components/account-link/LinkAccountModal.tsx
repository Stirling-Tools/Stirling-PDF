import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import {
  useSupabaseLogin,
  type SupabaseLoginSession,
} from "@app/auth/ui/useSupabaseLogin";
import { FlowModal } from "@portal/components/shared/FlowModal";
import { StepModalHeader } from "@portal/components/shared/StepModalHeader";
import { ConnectBenefitsSlide } from "@portal/components/account-link/connect/ConnectBenefitsSlide";
import { ConnectSignInSlide } from "@portal/components/account-link/connect/ConnectSignInSlide";
import { ConnectDoneSlide } from "@portal/components/account-link/connect/ConnectDoneSlide";
import {
  ensureSaasSupabase,
  PENDING_LINK_KEY,
  SAAS_OAUTH_PROVIDERS,
} from "@portal/auth/saasSupabase";

/** 1 = what you unlock, 2 = sign in, 3 = connected. */
type Step = 1 | 2 | 3;

const TOTAL_STEPS = 3;

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * "link" runs the full three-step flow; "reauth" only refreshes an expired SaaS session for an
   * already linked instance, so it stays a single sign-in step with no pitch and no success screen.
   */
  mode?: "link" | "reauth";
  /** Called with the SaaS session after a successful sign-in. */
  onLinked: (session: SupabaseLoginSession) => void | Promise<void>;
  /** Current link status, so the flow can tell that the register call landed. */
  status?: { linked: boolean; name: string | null } | null;
  /** Failure from the link call, as opposed to a failed sign-in. */
  linkError?: string | null;
}

/**
 * The Connect flow: three steps that explain what linking a Stirling account gives you, sign the
 * admin in, and route them into what they just unlocked.
 *
 * <p>Chrome is the portal's own {@link FlowModal} and {@link StepModalHeader}, the same shells the
 * procurement and prepay flows wear, so this dialog cannot drift from them. The device secret still
 * never reaches the browser: sign-in mints a SaaS JWT, the local backend exchanges it, and this
 * component only ever sees linked or not.
 *
 * <p>Step 2 is deliberately isolated in its own component. Steps 1 and 3 are about value and
 * activation and do not care how the credential is obtained, so a pairing-code flow can replace the
 * middle step without touching either.
 */
export function LinkAccountModal({
  open,
  onClose,
  mode = "link",
  onLinked,
  status,
  linkError,
}: Props) {
  const { t } = useTranslation();
  const reauth = mode === "reauth";
  const [step, setStep] = useState<Step>(1);

  useEffect(() => {
    if (open) ensureSaasSupabase();
  }, [open]);

  // Re-opening always restarts the pitch. Without this, a dismissal on step 2 would reopen there
  // and the admin would never see the reason they were being asked.
  useEffect(() => {
    if (!open) setStep(1);
  }, [open]);

  // The register call is what decides success, and it resolves in the parent, so drive off the
  // resulting status rather than the sign-in promise. This also lands an SSO return on the right
  // step, since the redirect completes the link before the dialog is reopened.
  useEffect(() => {
    if (open && !reauth && status?.linked) setStep(3);
  }, [open, reauth, status?.linked]);

  const login = useSupabaseLogin({
    providers: SAAS_OAUTH_PROVIDERS,
    redirectTo: window.location.href,
    onBeforeOAuth: () => sessionStorage.setItem(PENDING_LINK_KEY, mode),
    onSuccess: async (session) => {
      await onLinked(session);
      // Re-auth has nothing to confirm: the session is refreshed and the instance never changed.
      if (reauth) onClose();
    },
  });

  const onSimulate = useCallback(
    async (session: SupabaseLoginSession) => {
      await onLinked(session);
      if (reauth) onClose();
    },
    [onLinked, reauth, onClose],
  );

  const stepLabel = t(
    "portal.accountLink.connect.step",
    "Step {{current}} of {{total}}",
    { current: step, total: TOTAL_STEPS },
  );

  const title = reauth
    ? t("portal.accountLink.modal.reauthTitle", "Sign in again")
    : step === 1
      ? t(
          "portal.accountLink.connect.benefits.title",
          "Connect this server to a Stirling account",
        )
      : step === 2
        ? t("portal.accountLink.connect.signIn.title", "Sign in to Stirling")
        : status?.name
          ? t(
              "portal.accountLink.connect.done.titleNamed",
              "Connected to {{name}}",
              {
                name: status.name,
              },
            )
          : t("portal.accountLink.connect.done.title", "Connected");

  const footer = reauth ? undefined : step === 1 ? (
    <>
      <Button variant="quiet" accent="neutral" onClick={onClose}>
        {t("portal.accountLink.connect.notNow", "Not now")}
      </Button>
      <Button variant="primary" onClick={() => setStep(2)}>
        {t("portal.accountLink.connect.start", "Connect account")}
      </Button>
    </>
  ) : step === 2 ? (
    <Button variant="quiet" accent="neutral" onClick={() => setStep(1)}>
      {t("portal.accountLink.connect.back", "Back")}
    </Button>
  ) : (
    <>
      <span />
      <Button variant="primary" onClick={onClose}>
        {t("portal.accountLink.connect.done.cta", "Done")}
      </Button>
    </>
  );

  return (
    <FlowModal open={open} onClose={onClose} label={title} footer={footer}>
      <StepModalHeader
        brand
        title={title}
        step={reauth ? undefined : step}
        total={reauth ? undefined : TOTAL_STEPS}
        stepLabel={reauth ? undefined : stepLabel}
        closeLabel={t("portal.accountLink.connect.close", "Close")}
        onClose={onClose}
      />

      {!reauth && step === 1 && <ConnectBenefitsSlide />}

      {(reauth || step === 2) && (
        <ConnectSignInSlide
          login={login}
          linkError={linkError}
          reauth={reauth}
          onSimulate={onSimulate}
        />
      )}

      {!reauth && step === 3 && <ConnectDoneSlide onNavigate={onClose} />}
    </FlowModal>
  );
}
