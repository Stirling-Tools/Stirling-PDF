import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState, Skeleton } from "@shared/components";
import { useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  acceptQuote,
  fetchQuotePdf,
  fetchSnapshot,
  issueQuote,
  JOURNEY,
  resetProcurement,
  startTrial,
  type ProcurementSnapshot,
  type QuoteResult,
} from "@portal/api/procurement";
import { DealStatusHero } from "@portal/components/procurement/DealStatusHero";
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
 * The procurement experience on Home: a compact deal-status hero (active) or the enterprise
 * upsell (not started), both expanding into the full-screen takeover modal that holds the whole
 * journey — start trial, build + issue a quote (a Stripe Quote with a real PDF, the milestone the
 * buyer can share and return to), then accept it into a committed subscription. Rendered on Home
 * and at /procurement (autoOpen). Gated on a linked account.
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

  const data = snap ?? (state.loading ? null : state.data);
  const started = data?.dealId != null;
  const stage = data?.stage;
  const latest = data?.latestQuote ?? null;
  const isDraft = !latest || latest.status === "draft";
  const isIssued = latest?.status === "sent" || latest?.status === "open";
  const isAccepted = latest?.status === "accepted";
  // Builder shows for a brand-new/draft quote, or when the buyer chooses to edit an existing one.
  const showBuilder =
    editing || (isDraft && (stage === "trial" || stage === "quote"));

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setSnap(await fetchSnapshot());
    } finally {
      setBusy(false);
    }
  }

  const onStartTrial = () => run(() => startTrial());
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
  const onAccept = () =>
    run(() => (latest ? acceptQuote(latest.quoteId) : Promise.resolve()));

  async function onDownloadPdf() {
    if (!latest) return;
    const blob = await fetchQuotePdf(latest.quoteId);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const banner =
    isLinked && started && data ? (
      <DealStatusHero snapshot={data} onExpand={() => setOpen(true)} />
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
        <Button variant="outline" accent="blue" onClick={() => setOpen(true)}>
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

        {isLinked && state.loading && !data && <Skeleton height="10rem" />}

        {isLinked && !state.loading && !started && (
          <EmptyState
            eyebrow={t("procurement.start.eyebrow")}
            title={t("procurement.start.title")}
            description={t("procurement.start.description")}
            actions={
              <Button
                variant="gradient"
                accent="purple"
                loading={busy}
                onClick={onStartTrial}
              >
                {t("procurement.start.cta")}
              </Button>
            }
          />
        )}

        {isLinked && started && (
          <>
            <div className="portal-proc__modal-stepper">
              <StageStepper journey={JOURNEY} currentStage={stage!} />
            </div>

            {showBuilder && (
              <QuoteBuilder
                deployment="cloud"
                initial={latest?.config}
                onGenerate={onGenerate}
              />
            )}

            {!editing && isIssued && latest && (
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
                    onClick={onAccept}
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

            {!editing && isAccepted && latest && (
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
                        window.open(
                          latest.invoiceUrl!,
                          "_blank",
                          "noopener",
                        )
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
