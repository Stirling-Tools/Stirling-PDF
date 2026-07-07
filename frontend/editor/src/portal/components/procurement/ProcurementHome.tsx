import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Card, EmptyState, Skeleton } from "@app/ui";
import { useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  acceptQuote,
  extendTrial,
  fetchQuotePdf,
  fetchSnapshot,
  goLive,
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
import {
  KeyDocumentsModal,
  ScheduleCallModal,
  TrialManageModal,
} from "@portal/components/procurement/ProcurementExtras";
import { ProcurementModal } from "@portal/components/procurement/ProcurementModal";
import {
  LiveStageCard,
  PaymentStageCard,
  QuoteMilestoneCard,
} from "@portal/components/procurement/ProcurementStages";
import { QuoteBuilder } from "@portal/components/procurement/QuoteBuilder";
import { StageStepper } from "@portal/components/procurement/StageStepper";
import "@portal/views/Procurement.css";

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
  const { setActiveView } = useView();

  const state = useAsync<ProcurementSnapshot | null>(
    () => (isLinked ? fetchSnapshot() : Promise.resolve(null)),
    [isLinked],
  );
  const [snap, setSnap] = useState<ProcurementSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [invoicePdf, setInvoicePdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<null | "docs" | "schedule" | "trial">(
    null,
  );

  const data = snap ?? (state.loading ? null : state.data);
  const started = data?.dealId != null;
  const stage = data?.stage;
  const latest = data?.latestQuote ?? null;
  const isIssued = latest?.status === "sent" || latest?.status === "open";
  // No live quote to act on (none yet, still a draft, or expired/canceled) → the buyer (re)builds.
  const isDraft =
    !latest ||
    ["draft", "expired", "canceled", "cancelled"].includes(latest.status);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSnap(await fetchSnapshot());
    } catch (e) {
      console.error("[procurement] action failed", e);
      setError(e instanceof Error ? e.message : String(e));
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
      setInvoicePdf(null);
    });
  const onGenerate = (draft: QuoteResult) =>
    run(async () => {
      await issueQuote(draft.quoteId);
      setEditing(false);
    });
  // Milestone → agreement (security) stage; then agreeing accepts into a subscription.
  const onAcceptQuote = () => run(startAgreement);
  const onAgree = () =>
    run(async () => {
      if (!latest) return;
      const res = await acceptQuote(latest.quoteId);
      setInvoicePdf(res.invoicePdf);
    });

  async function onDownloadPdf() {
    if (!latest) return;
    setDownloading(true);
    try {
      const blob = await fetchQuotePdf(latest.quoteId);
      // A same-gesture <a download> click is reliable; window.open after an await is often
      // popup-blocked (which is what made this take "a few goes").
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${latest.quoteNumber || "quote"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error("[procurement] quote PDF download failed", e);
      setError(t("portal.procurement.milestone.downloadError"));
    } finally {
      setDownloading(false);
    }
  }

  // A deep link (/procurement) opens the flow when a deal is already underway; if there's no deal
  // yet it must NOT silently start a trial — leave the modal closed so the Start-trial CTA shows.
  useEffect(() => {
    if (autoOpen && started) setOpen(true);
  }, [autoOpen, started]);

  const banner =
    isLinked && started && data ? (
      <DealStatusHero
        snapshot={data}
        busy={busy}
        onExpand={() => setOpen(true)}
        onKeyDocs={() => setExtra("docs")}
        onInvite={() => setActiveView("users")}
        onSchedule={() => setExtra("schedule")}
        onManageTrial={() => setExtra("trial")}
        onNavigate={setActiveView}
      />
    ) : (
      <Card className="portal-proc__upsell">
        <div className="portal-proc__upsell-text">
          <span className="portal-proc__upsell-badge">
            {t("portal.procurement.upsell.homeBadge")}
          </span>
          <p className="portal-proc__upsell-copy">
            <strong>{t("portal.procurement.upsell.homeHeadline")} </strong>
            {t("portal.procurement.upsell.homeBody")}
          </p>
        </div>
        <Button
          variant="secondary"
          accent="default"
          loading={busy}
          disabled={!isLinked}
          onClick={onStartTrial}
        >
          {t("portal.procurement.upsell.homeCta")}
        </Button>
      </Card>
    );

  return (
    <>
      {banner}
      <ProcurementModal
        open={open}
        onClose={() => setOpen(false)}
        title={t("portal.procurement.title")}
        subtitle={t("portal.procurement.subtitle")}
      >
        {error && (
          <Banner
            tone="danger"
            title={t("portal.procurement.error.title")}
            onDismiss={() => setError(null)}
          >
            {error}
          </Banner>
        )}

        {!isLinked && (
          <EmptyState
            eyebrow={t("portal.procurement.link.eyebrow")}
            title={t("portal.procurement.link.title")}
            description={t("portal.procurement.link.description")}
            actions={
              <Button
                variant="primary"
                accent="premium"
                onClick={() => openLinkModal()}
              >
                {t("portal.procurement.link.cta")}
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

            {(editing ||
              (isDraft && (stage === "trial" || stage === "quote"))) && (
              <QuoteBuilder
                deployment="cloud"
                initial={latest?.config}
                onGenerate={onGenerate}
              />
            )}

            {!editing && isIssued && stage === "quote" && latest && (
              <QuoteMilestoneCard
                quote={latest}
                busy={busy}
                downloading={downloading}
                onAccept={onAcceptQuote}
                onDownload={onDownloadPdf}
                onEdit={() => setEditing(true)}
              />
            )}

            {!editing && stage === "security" && latest && (
              <ProcurementAgreement
                quote={latest}
                busy={busy}
                onAgree={onAgree}
              />
            )}

            {!editing && stage === "procurement" && latest && (
              <PaymentStageCard
                invoiceUrl={latest.invoiceUrl}
                invoicePdf={invoicePdf}
                busy={busy}
                onSimulate={() => run(goLive)}
              />
            )}

            {!editing && stage === "active" && <LiveStageCard />}

            <div className="portal-proc__reset">
              <button type="button" onClick={onReset} disabled={busy}>
                {t("portal.procurement.reset")}
              </button>
            </div>
          </>
        )}
      </ProcurementModal>

      <KeyDocumentsModal
        open={extra === "docs"}
        onClose={() => setExtra(null)}
      />
      <ScheduleCallModal
        open={extra === "schedule"}
        onClose={() => setExtra(null)}
      />
      {data && (
        <TrialManageModal
          open={extra === "trial"}
          onClose={() => setExtra(null)}
          snapshot={data}
          busy={busy}
          onExtend={async () => {
            await onExtendTrial();
            setExtra(null);
          }}
          onCancel={async () => {
            await onReset();
            setExtra(null);
          }}
        />
      )}
    </>
  );
}
