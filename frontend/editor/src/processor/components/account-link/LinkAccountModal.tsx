import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { FlowModal } from "@processor/components/shared/FlowModal";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";
import { ConnectAskStep } from "@processor/components/account-link/connect/ConnectAskStep";
import { ConnectHandoffGhost } from "@processor/components/account-link/connect/ConnectHandoffGhost";
import {
  ConnectCallbackView,
  isRetryableOutcome,
  type ConnectOutcome,
} from "@processor/components/account-link/ConnectCallbackView";
import { useConnectHandoff } from "@processor/hooks/useConnectHandoff";
import "@processor/views/ConnectCallback.css";

/**
 * Ordered, so a step's position in this list is its number and the list's length is the total.
 * Adding or removing a step means editing this and its arm of `stepBody`, nothing else.
 */
const STEP_ORDER = ["ask", "handoff", "outcome"] as const;

type StepId = (typeof STEP_ORDER)[number];

interface Props {
  open: boolean;
  onClose: () => void;
  /** "reauth" only re-establishes the browser session, so it stays one step with no pitch. */
  mode?: "link" | "reauth";
  /** Published by the callback route; present means the admin is returning from Stirling. */
  outcome?: ConnectOutcome | null;
}

/**
 * The progress bar spans the redirect on purpose: the admin leaves on the hand-off and returns on
 * the outcome step of the dialog they left, rather than being greeted by a different one.
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

  // Busy outranks a stale outcome, or a retry sits on the old result until the browser leaves.
  let step: StepId = "ask";
  if (handoff.busy) step = "handoff";
  else if (outcome) step = "outcome";

  const title = stepTitle();
  const current = STEP_ORDER.indexOf(step) + 1;

  // Re-auth is one step, so it carries no count and no progress bar.
  const stepChrome = reauth
    ? {}
    : {
        step: current,
        total: STEP_ORDER.length,
        stepLabel: t(
          "processor.accountLink.connect.step",
          "Step {{current}} of {{total}}",
          { current, total: STEP_ORDER.length },
        ),
      };

  return (
    <FlowModal
      open={open}
      onClose={onClose}
      label={title}
      footer={stepFooter()}
    >
      <StepModalHeader
        brand
        title={title}
        {...stepChrome}
        closeLabel={t("processor.accountLink.connect.close", "Close")}
        onClose={onClose}
      />
      {stepBody()}
    </FlowModal>
  );

  function stepTitle(): string {
    if (reauth) {
      return t("processor.accountLink.modal.reauthTitle", "Sign in again");
    }
    if (step === "ask") {
      return t(
        "processor.accountLink.modal.linkTitle",
        "Connect your Stirling account",
      );
    }
    if (step === "handoff") {
      return t("processor.accountLink.connect.handoff.title", "Connecting");
    }
    if (outcome?.state === "linked") {
      return t("processor.accountLink.connect.done.title", "Connected");
    }
    return t("processor.accountLink.connect.done.pendingTitle", "Almost there");
  }

  function stepBody() {
    switch (step) {
      case "ask":
        return <ConnectAskStep reauth={reauth} error={handoff.error} />;
      case "handoff":
        return <ConnectHandoffGhost />;
      case "outcome":
        return outcome ? (
          <ConnectCallbackView
            state={outcome.state}
            sessionRestored={outcome.sessionRestored}
            onDone={onClose}
          />
        ) : null;
    }
  }

  function closeButton() {
    return (
      <Button variant="quiet" accent="neutral" onClick={onClose}>
        {t("processor.accountLink.connect.close", "Close")}
      </Button>
    );
  }

  function retryButton(onRetry: () => void) {
    return (
      <Button variant="primary" onClick={onRetry}>
        {t("processor.accountLink.connect.callback.retry", "Try again")}
      </Button>
    );
  }

  function stepFooter() {
    if (step === "ask") {
      const dismiss = reauth
        ? t("processor.accountLink.modal.cancel", "Cancel")
        : t("processor.accountLink.connect.notNow", "Not now");
      const start = reauth
        ? t("processor.accountLink.modal.continueReauth", "Sign in again")
        : t("processor.accountLink.connect.start", "Connect Stirling account");
      return (
        <>
          <Button variant="quiet" accent="neutral" onClick={onClose}>
            {dismiss}
          </Button>
          <Button variant="primary" onClick={handoff.begin}>
            {start}
          </Button>
        </>
      );
    }

    // The request is out and the browser is leaving; Close so a stall is not a dead end.
    if (step === "handoff") {
      return (
        <>
          <span />
          {closeButton()}
        </>
      );
    }

    // A retry over a call that has not answered is how you get two handshakes.
    if (outcome?.state === "working") {
      return (
        <>
          <span />
          {closeButton()}
        </>
      );
    }

    // Still open: re-claim rather than spend the approval a leader gave by hand.
    if (outcome?.reclaim) {
      return (
        <>
          {closeButton()}
          {retryButton(outcome.reclaim)}
        </>
      );
    }

    if (outcome && isRetryableOutcome(outcome.state)) {
      return (
        <>
          {closeButton()}
          {retryButton(handoff.begin)}
        </>
      );
    }

    return (
      <>
        <span />
        <Button variant="primary" onClick={onClose}>
          {t("processor.accountLink.connect.done.cta", "Done")}
        </Button>
      </>
    );
  }
}
