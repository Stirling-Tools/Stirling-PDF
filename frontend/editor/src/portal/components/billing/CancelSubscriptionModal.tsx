import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, FormField, Input, RadioGroup } from "@app/ui";
import { formatPeriodDate } from "@app/billing";
import { trackCancellation } from "@app/services/analytics";
import {
  cancelSubscription,
  contactBeforeCancelling,
  fetchSubscriptionStates,
  resumeSubscription,
  type CancelProduct,
  type CancelReason,
  type CancelScope,
  type SubscriptionState,
  type Wallet,
} from "@portal/api/billing";
import { HttpError } from "@portal/api/http";
import { FlowModal } from "@portal/components/shared/FlowModal";
import { StepModalHeader } from "@portal/components/shared/StepModalHeader";
import { CalendlyInline } from "@portal/components/procurement/CalendlyInline";
import "@portal/components/billing/CancelSubscriptionModal.css";

type Step =
  | "reason"
  | "offer"
  | "confirm"
  | "done"
  | "call"
  | "message"
  | "sent";

/** Reasons where a save attempt would only be in the way: the decision is already made. */
const SKIPS_OFFER: CancelReason[] = ["switched_service", "temporary"];
/** Reasons where writing to us beats a call: we need the details in words. */
const MESSAGE_FIRST: CancelReason[] = ["missing_features", "not_working"];

/**
 * The in-app cancel flow: a required reason, at most one "before you go" step, then a confirm that
 * says what ends and when. Cancelling only schedules the end of the paid period; nothing stops
 * early and resuming is one click until then.
 *
 * <p>Talking to us first never changes the plan. The call books through Calendly and the message
 * goes to the support inbox and Slack.
 */
export function CancelSubscriptionModal({
  open,
  onClose,
  wallet,
  email,
  onChanged,
  onLowerSpendLimit,
}: {
  open: boolean;
  onClose: () => void;
  wallet: Wallet;
  /** The signed-in leader's email: prefills the reply address and the Calendly booking. */
  email?: string | null;
  /** The edge function's answer after a cancel or resume; the wallet mirror trails it. */
  onChanged: (states: SubscriptionState[]) => void;
  /** Opens the spend limit editor; the Processor's alternative to cancelling. */
  onLowerSpendLimit?: () => void;
}) {
  const { t } = useTranslation();
  const renewing = useMemo(() => {
    const out: CancelProduct[] = [];
    if (wallet.team.held && !wallet.team.endsAt) out.push("team");
    if (wallet.processor.active && !wallet.processor.endsAt)
      out.push("processor");
    return out;
  }, [wallet]);

  const [step, setStep] = useState<Step>("reason");
  const [scope, setScope] = useState<CancelScope | null>(null);
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [detail, setDetail] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [offerShown, setOfferShown] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState(email ?? "");
  const [states, setStates] = useState<SubscriptionState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    if (!open) return;
    setStep("reason");
    setScope(renewing.length === 1 ? renewing[0] : null);
    setReason(null);
    setDetail("");
    setCompetitor("");
    setOfferShown(null);
    setMessage("");
    setError(null);
    finished.current = false;
    trackCancellation("cancel_flow_opened", { products: renewing.join(",") });
    let cancelled = false;
    // Best-effort: the confirm step falls back to the wallet's period end without it.
    fetchSubscriptionStates()
      .then((next) => {
        if (!cancelled) setStates(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Reset only when the dialog opens: a wallet poll mid-flow must not throw the reader back a step.
  }, [open]);

  useEffect(() => {
    if (open && email && !replyTo) setReplyTo(email);
  }, [open, email, replyTo]);

  const products: CancelProduct[] =
    scope === "both" ? ["team", "processor"] : scope ? [scope] : [];
  const productName = (product: CancelProduct) =>
    product === "team"
      ? t("portal.billing.cancel.product.team", "Team plan")
      : t("portal.billing.cancel.product.processor", "Processor");
  const scopeName =
    scope === "both"
      ? t("portal.billing.cancel.product.both", "Team plan and Processor")
      : scope
        ? productName(scope)
        : "";
  const endOf = (product: CancelProduct) => {
    const state = states.find((s) => s.product === product);
    return formatPeriodDate(
      state?.endsAt ?? state?.periodEnd ?? wallet.billingPeriodEnd,
      { year: true },
    );
  };
  const endDate = products.length ? endOf(products[0]) : "";

  const reasonOptions: { value: CancelReason; label: string }[] = [
    {
      value: "too_expensive",
      label: t(
        "portal.billing.cancel.reason.tooExpensive",
        "It costs too much",
      ),
    },
    {
      value: "unused",
      label: t("portal.billing.cancel.reason.unused", "We don't use it enough"),
    },
    {
      value: "missing_features",
      label: t(
        "portal.billing.cancel.reason.missingFeatures",
        "It's missing something we need",
      ),
    },
    {
      value: "not_working",
      label: t(
        "portal.billing.cancel.reason.notWorking",
        "Something isn't working",
      ),
    },
    {
      value: "too_complex",
      label: t(
        "portal.billing.cancel.reason.tooComplex",
        "It's too hard to set up or use",
      ),
    },
    {
      value: "switched_service",
      label: t(
        "portal.billing.cancel.reason.switching",
        "We're switching to another tool",
      ),
    },
    {
      value: "temporary",
      label: t(
        "portal.billing.cancel.reason.temporary",
        "We only needed it for a project",
      ),
    },
    {
      value: "support",
      label: t(
        "portal.billing.cancel.reason.support",
        "Support didn't solve our problem",
      ),
    },
    {
      value: "other",
      label: t("portal.billing.cancel.reason.other", "Something else"),
    },
  ];
  const reasonLabel = reasonOptions.find((o) => o.value === reason)?.label;

  const spendLimitOffer =
    Boolean(onLowerSpendLimit) &&
    products.includes("processor") &&
    (reason === "too_expensive" || reason === "unused");
  const canContinue =
    scope != null &&
    reason != null &&
    (reason !== "other" || detail.trim().length > 0);

  function close() {
    if (!finished.current && step !== "done" && step !== "sent") {
      trackCancellation("cancel_flow_abandoned", { step, reason });
    }
    onClose();
  }

  function next() {
    if (!canContinue || !reason) return;
    trackCancellation("cancel_reason_selected", { reason, scope });
    setError(null);
    setStep(SKIPS_OFFER.includes(reason) ? "confirm" : "offer");
  }

  function takeOffer(offer: "call" | "message" | "spend_limit") {
    setOfferShown(offer);
    trackCancellation("cancel_offer_clicked", { offer, reason, scope });
    if (offer === "spend_limit") {
      finished.current = true;
      onClose();
      onLowerSpendLimit?.();
      return;
    }
    setError(null);
    setStep(offer);
  }

  async function confirm() {
    if (!scope || !reason) return;
    setBusy(true);
    setError(null);
    try {
      const next = await cancelSubscription({
        product: scope,
        reason,
        detail: detail.trim() || undefined,
        competitor: competitor.trim() || undefined,
        offerShown: offerShown ?? undefined,
      });
      setStates(next);
      trackCancellation("cancel_confirmed", { reason, scope });
      setStep("done");
      onChanged(next);
    } catch {
      setError(
        t(
          "portal.billing.cancel.error.cancel",
          "We couldn't cancel just now. Nothing has changed. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    if (!scope) return;
    setBusy(true);
    setError(null);
    try {
      const next = await resumeSubscription(scope);
      trackCancellation("cancel_resumed", { scope });
      finished.current = true;
      onChanged(next);
      onClose();
    } catch {
      setError(
        t(
          "portal.billing.cancel.error.resume",
          "We couldn't resume just now. Please try again from Usage & Billing.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!scope) return;
    setBusy(true);
    setError(null);
    try {
      await contactBeforeCancelling({
        product: products[0] ?? "team",
        reason,
        message: message.trim(),
        replyTo: replyTo.trim() || undefined,
      });
      finished.current = true;
      setStep("sent");
    } catch (e) {
      setError(
        e instanceof HttpError && e.status === 429
          ? t(
              "portal.billing.cancel.error.contactLimit",
              "You've already sent us three messages today. We'll be in touch.",
            )
          : t(
              "portal.billing.cancel.error.contact",
              "Your message didn't send. Please try again, or email support@stirlingpdf.com.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  const stepNumber = step === "reason" ? 1 : step === "offer" ? 2 : 3;
  const stepped = step === "reason" || step === "offer" || step === "confirm";
  const title =
    step === "reason"
      ? t("portal.billing.cancel.title.reason", "Cancel your subscription")
      : step === "offer"
        ? t("portal.billing.cancel.title.offer", "Before you go")
        : step === "confirm"
          ? t("portal.billing.cancel.title.confirm", "Cancel {{name}}?", {
              name: scopeName,
            })
          : step === "done"
            ? t("portal.billing.cancel.title.done", "{{name}} cancelled", {
                name: scopeName,
              })
            : step === "call"
              ? t("portal.billing.cancel.title.call", "Book a call")
              : step === "message"
                ? t("portal.billing.cancel.title.message", "Send us a message")
                : t("portal.billing.cancel.title.sent", "Message sent");

  const back = (to: Step) => (
    <Button variant="secondary" onClick={() => setStep(to)} disabled={busy}>
      {t("portal.billing.cancel.back", "Back")}
    </Button>
  );
  const keep = (
    <Button variant="secondary" onClick={close} disabled={busy}>
      {t("portal.billing.cancel.keep", "Keep my plan")}
    </Button>
  );

  const footer =
    step === "reason" ? (
      <>
        {keep}
        <Button onClick={next} disabled={!canContinue}>
          {t("portal.billing.cancel.continue", "Continue")}
        </Button>
      </>
    ) : step === "offer" ? (
      <>
        {back("reason")}
        <Button variant="secondary" onClick={() => setStep("confirm")}>
          {t("portal.billing.cancel.continueCancelling", "Continue cancelling")}
        </Button>
      </>
    ) : step === "confirm" ? (
      <>
        {keep}
        <Button accent="danger" onClick={confirm} loading={busy}>
          {t("portal.billing.cancel.confirm", "Cancel {{name}}", {
            name: scopeName,
          })}
        </Button>
      </>
    ) : step === "done" ? (
      <>
        <Button variant="secondary" onClick={resume} loading={busy}>
          {t("portal.billing.cancel.resume", "Resume {{name}}", {
            name: scopeName,
          })}
        </Button>
        <Button onClick={close}>
          {t("portal.billing.cancel.finish", "Done")}
        </Button>
      </>
    ) : step === "message" ? (
      <>
        {back("offer")}
        <Button
          onClick={send}
          loading={busy}
          disabled={!message.trim() || !replyTo.trim()}
        >
          {t("portal.billing.cancel.message.send", "Send message")}
        </Button>
      </>
    ) : step === "call" ? (
      <>
        {back("offer")}
        <Button onClick={close}>
          {t("portal.billing.cancel.finish", "Done")}
        </Button>
      </>
    ) : (
      <>
        <span />
        <Button onClick={close}>
          {t("portal.billing.cancel.finish", "Done")}
        </Button>
      </>
    );

  const usersOver = Math.max(
    0,
    wallet.team.usersInUse - wallet.freeUserAllowance,
  );

  return (
    <FlowModal
      open={open}
      onClose={close}
      label={title}
      size={step === "call" ? "lg" : "md"}
      disableBackdropClose={busy}
      header={
        <StepModalHeader
          title={title}
          step={stepped ? stepNumber : undefined}
          total={stepped ? 3 : undefined}
          stepLabel={
            stepped
              ? t("portal.billing.cancel.stepLabel", "Step {{step}} of 3", {
                  step: stepNumber,
                })
              : undefined
          }
        />
      }
      footer={<div className="portal-cancel__footer">{footer}</div>}
    >
      {step === "reason" && (
        <>
          {renewing.length > 1 && (
            <fieldset className="portal-cancel__group">
              <legend className="portal-cancel__legend">
                {t(
                  "portal.billing.cancel.scope.label",
                  "What do you want to cancel?",
                )}
              </legend>
              <RadioGroup
                name="cancel-scope"
                direction="horizontal"
                value={scope ?? ""}
                onChange={(value) => setScope(value as CancelScope)}
                options={[
                  { value: "processor", label: productName("processor") },
                  { value: "team", label: productName("team") },
                  {
                    value: "both",
                    label: t("portal.billing.cancel.scope.both", "Both"),
                  },
                ]}
              />
            </fieldset>
          )}
          <fieldset className="portal-cancel__group">
            <legend className="portal-cancel__legend">
              {t(
                "portal.billing.cancel.reason.label",
                "Why are you cancelling?",
              )}
            </legend>
            <RadioGroup
              name="cancel-reason"
              value={reason ?? ""}
              onChange={(value) => setReason(value as CancelReason)}
              options={reasonOptions}
              className="portal-cancel__reasons"
            />
          </fieldset>
          {reason === "switched_service" && (
            <FormField
              label={t(
                "portal.billing.cancel.competitor",
                "Which tool are you moving to?",
              )}
            >
              <Input
                value={competitor}
                maxLength={200}
                onChange={(e) => setCompetitor(e.target.value)}
              />
            </FormField>
          )}
          <FormField
            label={t(
              "portal.billing.cancel.detail",
              "What would have made you stay?",
            )}
            required={reason === "other"}
          >
            <textarea
              className="portal-cancel__textarea"
              rows={3}
              maxLength={2000}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </FormField>
        </>
      )}

      {step === "offer" && (
        <>
          <section className="portal-cancel__card">
            <h3 className="portal-cancel__card-title">
              {t("portal.billing.cancel.offer.talkTitle", "Talk to us first")}
            </h3>
            <p className="portal-cancel__card-body">
              {t(
                "portal.billing.cancel.offer.talkBody",
                "A person on our team reads every message. If something is wrong, we would like the chance to fix it.",
              )}
            </p>
            <div className="portal-cancel__card-actions">
              <Button
                variant={
                  reason && MESSAGE_FIRST.includes(reason)
                    ? "secondary"
                    : "primary"
                }
                onClick={() => takeOffer("call")}
              >
                {t("portal.billing.cancel.offer.call", "Book a 15 minute call")}
              </Button>
              <Button
                variant={
                  reason && MESSAGE_FIRST.includes(reason)
                    ? "primary"
                    : "secondary"
                }
                onClick={() => takeOffer("message")}
              >
                {t("portal.billing.cancel.offer.message", "Send a message")}
              </Button>
            </div>
          </section>
          {spendLimitOffer && (
            <section className="portal-cancel__card portal-cancel__card--row">
              <div>
                <h3 className="portal-cancel__card-title">
                  {t(
                    "portal.billing.cancel.offer.limitTitle",
                    "Lower your spend limit",
                  )}
                </h3>
                <p className="portal-cancel__card-body">
                  {t(
                    "portal.billing.cancel.offer.limitBody",
                    "The Processor has no standing fee. With a low limit you only pay for what runs.",
                  )}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => takeOffer("spend_limit")}
              >
                {t("portal.billing.cancel.offer.limitAction", "Set a limit")}
              </Button>
            </section>
          )}
        </>
      )}

      {step === "confirm" && (
        <dl className="portal-cancel__facts">
          <div className="portal-cancel__fact">
            <dt>{t("portal.billing.cancel.facts.endsOn", "Ends on")}</dt>
            <dd className="portal-cancel__fact-strong">{endDate}</dd>
          </div>
          <div className="portal-cancel__fact">
            <dt>{t("portal.billing.cancel.facts.untilThen", "Until then")}</dt>
            <dd>
              {t(
                "portal.billing.cancel.facts.nothingChanges",
                "Nothing changes.",
              )}
            </dd>
          </div>
          <div className="portal-cancel__fact">
            <dt>{t("portal.billing.cancel.facts.after", "After that")}</dt>
            <dd>
              <ul className="portal-cancel__list">
                {products.includes("team") &&
                  (usersOver > 0 ? (
                    <li>
                      {t(
                        "portal.billing.cancel.facts.teamOver",
                        "The free plan keeps {{free}} users active: leaders first, then the most recent sign-ins. The other {{over}} can't sign in until you renew. You can choose who stays from the Users page.",
                        {
                          free: wallet.freeUserAllowance,
                          over: usersOver,
                        },
                      )}
                    </li>
                  ) : (
                    <li>
                      {t(
                        "portal.billing.cancel.facts.teamWithin",
                        "Your team moves to the free plan, which covers {{free}} users.",
                        { free: wallet.freeUserAllowance },
                      )}
                    </li>
                  ))}
                {products.includes("processor") && (
                  <li>
                    {t(
                      "portal.billing.cancel.facts.processor",
                      "Processing beyond your free monthly credits stops.",
                    )}
                  </li>
                )}
                {products.includes("processor") &&
                  wallet.prepaidUnitsRemaining > 0 && (
                    <li>
                      {t(
                        "portal.billing.cancel.facts.prepaid",
                        "Your {{credits}} prepaid credits stay yours to use.",
                        {
                          credits:
                            wallet.prepaidUnitsRemaining.toLocaleString(),
                        },
                      )}
                    </li>
                  )}
                <li>
                  {t(
                    "portal.billing.cancel.facts.kept",
                    "Files, pipelines and settings are kept.",
                  )}
                </li>
              </ul>
            </dd>
          </div>
          <div className="portal-cancel__fact">
            <dt>{t("portal.billing.cancel.facts.charges", "Charges")}</dt>
            <dd>
              {products.includes("processor")
                ? t(
                    "portal.billing.cancel.facts.chargesMetered",
                    "Usage until then is billed on your final invoice. Nothing is refunded.",
                  )
                : t(
                    "portal.billing.cancel.facts.chargesTeam",
                    "No further charges. The current period is not refunded.",
                  )}
            </dd>
          </div>
        </dl>
      )}

      {step === "done" && (
        <div className="portal-cancel__prose">
          <p>
            {t(
              "portal.billing.cancel.done.ends",
              "Your {{name}} ends on {{date}}. Everything keeps working until then.",
              { name: scopeName, date: endDate },
            )}
          </p>
          {email && (
            <p className="portal-cancel__muted">
              {t(
                "portal.billing.cancel.done.emailed",
                "We sent a confirmation to {{email}}. You can resume any time before the end date.",
                { email },
              )}
            </p>
          )}
        </div>
      )}

      {step === "call" && <CalendlyInline email={email} />}

      {step === "message" && (
        <>
          <FormField
            label={t("portal.billing.cancel.message.label", "What's going on?")}
            required
          >
            <textarea
              className="portal-cancel__textarea"
              rows={6}
              maxLength={5000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </FormField>
          <FormField
            label={t("portal.billing.cancel.message.replyTo", "Reply to")}
            required
          >
            <Input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
            />
          </FormField>
          <div className="portal-cancel__context">
            <span className="portal-cancel__muted">
              {t(
                "portal.billing.cancel.message.context",
                "Sent with your message",
              )}
            </span>
            <div className="portal-cancel__chips">
              <span className="portal-cancel__chip">{scopeName}</span>
              {reasonLabel && (
                <span className="portal-cancel__chip">{reasonLabel}</span>
              )}
            </div>
          </div>
        </>
      )}

      {step === "sent" && (
        <div className="portal-cancel__prose">
          <p>
            {t(
              "portal.billing.cancel.sent.reply",
              "We will reply to {{email}}.",
              { email: replyTo },
            )}
          </p>
          <p className="portal-cancel__muted">
            {t(
              "portal.billing.cancel.sent.unchanged",
              "Your plan has not changed. If we can't help, you can still cancel from Usage & Billing.",
            )}
          </p>
        </div>
      )}

      {error && <Banner tone="danger" title={error} />}
    </FlowModal>
  );
}
