import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import { FlowModal } from "@portal/components/shared/FlowModal";
import { StepModalHeader } from "@portal/components/shared/StepModalHeader";
import { isSaasSupabaseConfigured } from "@portal/auth/saasSupabase";
import { ConnectBenefitsSlide } from "@portal/components/account-link/connect/ConnectBenefitsSlide";
import { ConnectHandoffGhost } from "@portal/components/account-link/connect/ConnectHandoffGhost";
import {
  ConnectCallbackView,
  isRetryableOutcome,
  type ConnectOutcome,
} from "@portal/components/account-link/ConnectCallbackView";
import { useConnectHandoff } from "@portal/hooks/useConnectHandoff";
import "@portal/views/ConnectCallback.css";

/** 1 = what you unlock, 2 = the hand-off, 3 = what came back. */
type Step = 1 | 2 | 3;

const TOTAL_STEPS = 3;

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * "link" connects this server to a team for the first time; "reauth" only re-establishes the
   * browser's Stirling session for a server that is already linked, so it stays one step with no
   * pitch and no success screen.
   */
  mode?: "link" | "reauth";
  /**
   * The outcome of a round trip to Stirling, published by the callback route. Present means the
   * admin is returning, so the dialog shows step 3 instead of step 1.
   */
  outcome?: ConnectOutcome | null;
}

/**
 * The connect flow: three steps that say why this server needs a Stirling account, hand the browser
 * over, and show what it got.
 *
 * <p>The progress bar spans a redirect, which is the shape of the flow rather than a compromise.
 * The admin leaves on step 2, signs in and approves on stirling.com, and returns on step 3 of the
 * dialog they left. Without that they would be sent to another site by one dialog and greeted by a
 * different one on the way back, with nothing saying the two were the same task.
 *
 * <p>The step is derived, not held. It is a function of what the flow is doing (asking, handing
 * over, reporting), so there is no state to reset when the dialog closes and no effect to move it
 * on when an outcome lands.
 *
 * <p>Chrome is the portal's own {@link FlowModal} and {@link StepModalHeader}, the shells
 * procurement and prepay already wear, so this dialog cannot drift from them.
 *
 * <p>The device secret never reaches the browser: approval happens on Stirling, the instance claims
 * the credential server to server, and this component only ever sees an outcome.
 */
export function LinkAccountModal({
  open,
  onClose,
  mode = "link",
  outcome = null,
}: Props) {
  const { t } = useTranslation();
  const reauth = mode === "reauth";
  const handoff = useConnectHandoff(reauth);

  // Busy outranks a stale outcome, so retrying from step 3 shows the hand-off again rather than
  // sitting on the old result until the browser leaves.
  const step: Step = handoff.busy ? 2 : outcome ? 3 : 1;

  const title = reauth
    ? t("portal.accountLink.modal.reauthTitle", "Sign in again")
    : step === 1
      ? t("portal.accountLink.modal.linkTitle", "Connect your Stirling account")
      : step === 2
        ? t("portal.accountLink.connect.handoff.title", "Connecting")
        : outcome?.state === "linked"
          ? t("portal.accountLink.connect.done.title", "Connected")
          : t("portal.accountLink.connect.done.pendingTitle", "Almost there");

  const stepLabel = t(
    "portal.accountLink.connect.step",
    "Step {{current}} of {{total}}",
    { current: step, total: TOTAL_STEPS },
  );

  return (
    <FlowModal
      open={open}
      onClose={onClose}
      label={title}
      footer={buildFooter()}
    >
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

      {reauth && step === 1 && (
        <p className="portal-connect__lede">
          {t(
            "portal.accountLink.connect.handoff.reauthLede",
            "Your Stirling session expired. Signing in again keeps usage and billing visible. This server stays connected either way.",
          )}
        </p>
      )}

      {step === 2 && <ConnectHandoffGhost />}

      {step === 3 && outcome && (
        <ConnectCallbackView
          state={outcome.state}
          sessionRestored={outcome.sessionRestored}
          onDone={onClose}
        />
      )}

      {/* On step 1, not in the slides: a failed hand-off drops back here, so this is where the
          reason has to be. */}
      {step === 1 && !isSaasSupabaseConfigured && (
        <Banner
          tone="warning"
          title={t(
            "portal.accountLink.modal.loginNotConfigured.title",
            "Stirling connection not configured",
          )}
        >
          {t("portal.accountLink.modal.loginNotConfigured.before", "Set")}{" "}
          <code>VITE_SUPABASE_URL</code>{" "}
          {t("portal.accountLink.modal.loginNotConfigured.and", "and")}{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY</code>{" "}
          {t(
            "portal.accountLink.modal.loginNotConfigured.after",
            "so this server can finish the connection when you come back.",
          )}
        </Banner>
      )}

      {step === 1 && handoff.error && (
        <Banner tone="danger">{handoff.error}</Banner>
      )}
    </FlowModal>
  );

  function buildFooter() {
    if (step === 1) {
      return (
        <>
          <Button variant="quiet" accent="neutral" onClick={onClose}>
            {reauth
              ? t("portal.accountLink.modal.cancel", "Cancel")
              : t("portal.accountLink.connect.notNow", "Not now")}
          </Button>
          <Button variant="primary" onClick={handoff.begin}>
            {reauth
              ? t("portal.accountLink.modal.continueReauth", "Sign in again")
              : t(
                  "portal.accountLink.connect.start",
                  "Connect Stirling account",
                )}
          </Button>
        </>
      );
    }

    // Nothing to confirm and nothing to go back to: the request is out and the browser is leaving.
    // Close is there so a stalled hand-off is not a dead end.
    if (step === 2) {
      return (
        <>
          <span />
          <Button variant="quiet" accent="neutral" onClick={onClose}>
            {t("portal.accountLink.connect.close", "Close")}
          </Button>
        </>
      );
    }

    // Still finishing: offering a retry over a call that has not answered is how you get two
    // handshakes.
    if (outcome?.state === "working") {
      return (
        <>
          <span />
          <Button variant="quiet" accent="neutral" onClick={onClose}>
            {t("portal.accountLink.connect.close", "Close")}
          </Button>
        </>
      );
    }

    // Still-open handshake: claim it again. Starting over would spend the approval a leader gave by
    // hand.
    if (outcome?.reclaim) {
      return (
        <>
          <Button variant="quiet" accent="neutral" onClick={onClose}>
            {t("portal.accountLink.connect.close", "Close")}
          </Button>
          <Button variant="primary" onClick={outcome.reclaim}>
            {t("portal.accountLink.connect.callback.retry", "Try again")}
          </Button>
        </>
      );
    }

    // Spent handshake: the fix is a new one, which is what the hand-off does.
    if (outcome && isRetryableOutcome(outcome.state)) {
      return (
        <>
          <Button variant="quiet" accent="neutral" onClick={onClose}>
            {t("portal.accountLink.connect.close", "Close")}
          </Button>
          <Button variant="primary" onClick={handoff.begin}>
            {t("portal.accountLink.connect.callback.retry", "Try again")}
          </Button>
        </>
      );
    }

    return (
      <>
        <span />
        <Button variant="primary" onClick={onClose}>
          {t("portal.accountLink.connect.done.cta", "Done")}
        </Button>
      </>
    );
  }
}
