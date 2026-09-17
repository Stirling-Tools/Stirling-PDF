import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { useAuth } from "@app/auth";
import { useClipboard } from "@mantine/hooks";
import { Button } from "@app/ui";
import { FlowModal } from "@portal/components/shared/FlowModal";
import { StepModalHeader } from "@portal/components/shared/StepModalHeader";
import { ExhaustedAccountLinkModal } from "@app/components/account-link/ExhaustedAccountLinkModal";
import { ConnectAskStep } from "@portal/components/account-link/connect/ConnectAskStep";
import { ConnectHandoffGhost } from "@portal/components/account-link/connect/ConnectHandoffGhost";
import {
  ConnectCallbackView,
  isRetryableOutcome,
  type ConnectOutcome,
} from "@portal/components/account-link/ConnectCallbackView";
import { useConnectHandoff } from "@portal/hooks/useConnectHandoff";
import type { LinkModalMode } from "@portal/contexts/UIContext";
import "@portal/views/ConnectCallback.css";

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
  mode?: LinkModalMode;
  /** Published by the callback route; present means the admin is returning from Stirling. */
  outcome?: ConnectOutcome | null;
  /** Editor hosts supply their own balance without mounting the Processor providers. */
  summary?: ReactNode;
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
  summary,
}: Props) {
  const navigate = useNavigate();
  // This dialog unmounts on close, so retain its trigger before FocusTrap moves focus.
  const trigger = useRef(document.activeElement);
  useEffect(
    () => () => {
      if (
        trigger.current instanceof HTMLElement &&
        trigger.current.isConnected
      ) {
        trigger.current.focus({ preventScroll: true });
      }
    },
    [],
  );
  const { t } = useTranslation();
  const { isAdmin, loading: authLoading } = useAuth();
  const clipboard = useClipboard();
  const adminMessage = t(
    "portal.accountLink.connect.adminRequired",
    "Ask your server administrator to open Usage & billing and link a Stirling account for more monthly credits. Manual PDF tools are still available.",
  );
  const reauth = mode === "reauth";
  const exhausted = mode === "exhausted";
  const handoff = useConnectHandoff(reauth);

  // Busy outranks a stale outcome, or a retry sits on the old result until the browser leaves.
  let step: StepId = "ask";
  if (handoff.busy) step = "handoff";
  else if (outcome) step = "outcome";

  const title = stepTitle();
  const current = STEP_ORDER.indexOf(step) + 1;

  // Re-auth is one step, so it carries no count and no progress bar.
  const stepChrome =
    reauth || !isAdmin || (exhausted && step === "ask")
      ? {}
      : {
          step: current,
          total: STEP_ORDER.length,
          stepLabel: t(
            "portal.accountLink.connect.step",
            "Step {{current}} of {{total}}",
            {
              current,
              total: STEP_ORDER.length,
            },
          ),
        };

  if (exhausted && step === "ask") {
    return (
      <ExhaustedAccountLinkModal
        open={open}
        onClose={onClose}
        onStart={handoff.begin}
        onManagePipeline={(id) =>
          navigate(
            `${PORTAL_BASENAME}/pipelines${id ? `/${encodeURIComponent(id)}` : ""}`,
          )
        }
      >
        <ConnectAskStep
          reauth={false}
          exhausted
          error={handoff.error}
          summary={summary}
        />
      </ExhaustedAccountLinkModal>
    );
  }

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
        closeLabel={t("portal.accountLink.connect.close", "Close")}
        onClose={onClose}
      />
      {stepBody()}
    </FlowModal>
  );

  function stepTitle(): string {
    if (!isAdmin && !reauth)
      return t(
        "portal.accountLink.connect.adminTitle",
        "Ask your server administrator",
      );
    if (reauth) {
      return t("portal.accountLink.modal.reauthTitle", "Sign in again");
    }
    if (step === "ask") {
      return exhausted
        ? t(
            "portal.accountLink.modal.exhaustedTitle",
            "Keep your workflows running",
          )
        : t(
            "portal.accountLink.modal.linkTitle",
            "Connect your Stirling account",
          );
    }
    if (step === "handoff") {
      return t("portal.accountLink.connect.handoff.title", "Connecting");
    }
    if (outcome?.state === "linked") {
      return t("portal.accountLink.connect.done.title", "Connected");
    }
    return t("portal.accountLink.connect.done.pendingTitle", "Almost there");
  }

  function stepBody() {
    switch (step) {
      case "ask":
        if (!isAdmin && !reauth) {
          return <p className="portal-connect__lede">{adminMessage}</p>;
        }
        return (
          <ConnectAskStep
            reauth={reauth}
            exhausted={exhausted}
            error={handoff.error}
            summary={summary}
          />
        );
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
        {t("portal.accountLink.connect.close", "Close")}
      </Button>
    );
  }

  function retryButton(onRetry: () => void) {
    return (
      <Button variant="primary" onClick={onRetry}>
        {t("portal.accountLink.connect.callback.retry", "Try again")}
      </Button>
    );
  }

  function stepFooter() {
    if (step === "ask") {
      if (!isAdmin && !reauth)
        return (
          <>
            {closeButton()}
            <Button
              variant="secondary"
              onClick={() => clipboard.copy(adminMessage)}
            >
              {clipboard.copied
                ? t("portal.accountLink.connect.copied", "Copied")
                : t(
                    "portal.accountLink.connect.copyAdminMessage",
                    "Copy message for administrator",
                  )}
            </Button>
          </>
        );
      const dismiss = reauth
        ? t("portal.accountLink.modal.cancel", "Cancel")
        : t("portal.accountLink.connect.notNow", "Not now");
      const start = reauth
        ? t("portal.accountLink.modal.continueReauth", "Sign in again")
        : exhausted
          ? t(
              "portal.accountLink.rail.exhaustedCta",
              "Link account for more credits",
            )
          : t("portal.accountLink.connect.start", "Connect Stirling account");
      return (
        <>
          <Button variant="quiet" accent="neutral" onClick={onClose}>
            {dismiss}
          </Button>
          <Button
            variant="primary"
            onClick={handoff.begin}
            disabled={authLoading}
          >
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
          {t("portal.accountLink.connect.done.cta", "Done")}
        </Button>
      </>
    );
  }
}
