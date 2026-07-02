import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState, Skeleton } from "@shared/components";
import { useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  acceptQuote,
  extendTrial,
  fetchQuotePdf,
  fetchSnapshot,
  issueQuote,
  JOURNEY,
  resetProcurement,
  startAgreement,
  startTrial,
  type ProcurementSnapshot,
  type QuoteResult,
} from "@portal/api/procurement";
import { DealStatusHero } from "@portal/components/procurement/DealStatusHero";
import { ProcurementAgreement } from "@portal/components/procurement/ProcurementAgreement";
import { ProcurementModal } from "@portal/components/procurement/ProcurementModal";
import { QuoteBuilder } from "@portal/components/procurement/QuoteBuilder";
import { StageStepper } from "@portal/components/procurement/StageStepper";
import "@portal/views/Procurement.css";

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

/**
 * The procurement experience on Home: a compact deal-status hero once a trial is running (or the
 * enterprise upsell on-ramp before it), both expanding into the full-screen takeover modal that
 * holds the journey — build + issue a quote (a Stripe Quote with a real PDF, the milestone the buyer
 * can share and return to), review + agree to the enterprise agreement, then accept into a committed
 * subscription. Starting a trial is a single click (no "start a trial" prompt); the deadline + next
 * steps then show on the hero. Rendered on Home and at /procurement (autoOpen). Gated on a link.
 */
export function ProcurementHome({ autoOpen = false }: { autoOpen?: boolean }) {
  const { t } = useTranslation();
  const { isLinked } = useLink();
  const { openLinkModal } = useUI();

  const state = useAsync<ProcurementSnapshot | null>(
    () => (isLinked ? fetchSnapshot() : Promise.resolve(null)),
    [isLinked],
  );
  const [snap, setSnap] = useState<ProcurementSnapshot | null>(null);
  const [open, setOpen] = useState(autoOpen);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const autoStarted = useRef(false);

  const data = snap ?? (state.loading ? null : state.data);
  const started = data?.dealId != null;
  const stage = data?.stage;
  const latest = data?.latestQuote ?? null;
  const isDraft = !latest || latest.status === "draft";
  const isIssued = latest?.status === "sent" || latest?.status === "open";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setSnap(await fetchSnapshot());
    } finally {
      setBusy(false);
    }
  }

  const onStartTrial = () => run(startTrial);
  const onExtendTrial = () => run(extendTrial);
  const onReset = () =>
    run(async () => {
      await resetProcurement();
      setEditing(false);
    });
  const onGenerate = (draft: QuoteResult) =>
    run(async () => {
      await issueQuote(draft.quoteId);
      setEditing(false);
    });
  // Milestone → agreement (security) stage; then agreeing accepts into a subscription.
  const onAcceptQuote = () => run(startAgreement);
  const onAgree = () =>
    run(() => (latest ? acceptQuote(latest.quoteId) : Promise.resolve()));

  async function onDownloadPdf() {
    if (!latest) return;
    const blob = await fetchQuotePdf(latest.quoteId);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  // Deep-linking to /procurement should start the journey, not present a "start a trial" prompt:
  // if we land here linked but with no deal, kick the trial off once.
  useEffect(() => {
    if (autoOpen && isLinked && !state.loading && !started && !autoStarted.current) {
      autoStarted.current = true;
      onStartTrial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, isLinked, state.loading, started]);

  const banner =
    isLinked && started && data ? (
      <DealStatusHero
        snapshot={data}
        busy={busy}
        onExpand={() => setOpen(true)}
        onExtendTrial={onExtendTrial}
      />
    ) : (
      <Card className="portal-proc__upsell">
        <div className="portal-proc__upsell-text">
          <span className="portal-proc__upsell-badge">
            {t("procurement.upsell.homeBadge")}
          </span>
          <p className="portal-proc__upsell-copy">
            <strong>{t("procurement.upsell.homeHeadline")} </strong>
            {t("procurement.upsell.homeBody")}
          </p>
        </div>
        <Button
          variant="outline"
          accent="blue"
          loading={busy}
          disabled={!isLinked}
          onClick={onStartTrial}
        >
          {t("procurement.upsell.homeCta")}
        </Button>
      </Card>
    );

  return (
    <>
      {banner}
      <ProcurementModal
        open={open}
        onClose={() => setOpen(false)}
        title={t("procurement.title")}
        subtitle={t("procurement.subtitle")}
      >
        {!isLinked && (
          <EmptyState
            eyebrow={t("procurement.link.eyebrow")}
            title={t("procurement.link.title")}
            description={t("procurement.link.description")}
            actions={
              <Button
                variant="gradient"
                accent="purple"
                onClick={() => openLinkModal()}
              >
                {t("procurement.link.cta")}
              </Button>
            }
          />
        )}

        {isLinked && (state.loading || !started) && <Skeleton height="10rem" />}

        {isLinked && started && (
          <>
            <div className="portal-proc__modal-stepper">
              <StageStepper journey={JOURNEY} currentStage={stage!} />
            </div>

            {(editing || (isDraft && (stage === "trial" || stage === "quote"))) && (
              <QuoteBuilder
                deployment="cloud"
                initial={latest?.config}
                onGenerate={onGenerate}
              />
            )}

            {!editing && isIssued && stage === "quote" && latest && (
              <Card padding="loose">
                <span className="portal-proc__eyebrow">
                  {t("procurement.milestone.eyebrow", {
                    number: latest.quoteNumber,
                  })}
                </span>
                <h3 className="portal-proc__builder-title">
                  {t("procurement.milestone.title")}
                </h3>
                <p className="portal-proc__subtitle">
                  {t("procurement.milestone.description")}
                </p>
                <div className="portal-proc__milestone-totals">
                  <span className="portal-proc__milestone-annual">
                    {money(latest.annualNetMinor, latest.currency)}
                    <small>{t("procurement.milestone.perYear")}</small>
                  </span>
                  <span className="portal-proc__milestone-tcv">
                    {t("procurement.milestone.tcv", {
                      value: money(latest.tcvMinor, latest.currency),
                    })}
                  </span>
                </div>
                <div className="portal-proc__payment-actions">
                  <Button
                    variant="gradient"
                    accent="purple"
                    loading={busy}
                    onClick={onAcceptQuote}
                  >
                    {t("procurement.milestone.accept")}
                  </Button>
                  <Button variant="outline" onClick={onDownloadPdf}>
                    {t("procurement.milestone.download")}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(true)}>
                    {t("procurement.milestone.edit")}
                  </Button>
                </div>
              </Card>
            )}

            {!editing && stage === "security" && latest && (
              <ProcurementAgreement
                quote={latest}
                busy={busy}
                onAgree={onAgree}
              />
            )}

            {!editing &&
              (stage === "procurement" || stage === "active") &&
              latest && (
                <Card padding="loose">
                  <h3 className="portal-proc__builder-title">
                    {t("procurement.payment.title")}
                  </h3>
                  <p className="portal-proc__subtitle">
                    {t("procurement.payment.description")}
                  </p>
                  {latest.invoiceUrl && (
                    <div className="portal-proc__payment-actions">
                      <Button
                        variant="gradient"
                        accent="purple"
                        onClick={() =>
                          window.open(latest.invoiceUrl!, "_blank", "noopener")
                        }
                      >
                        {t("procurement.payment.viewInvoice")}
                      </Button>
                    </div>
                  )}
                </Card>
              )}

            <div className="portal-proc__reset">
              <button type="button" onClick={onReset} disabled={busy}>
                {t("procurement.reset")}
              </button>
            </div>
          </>
        )}
      </ProcurementModal>
    </>
  );
}
