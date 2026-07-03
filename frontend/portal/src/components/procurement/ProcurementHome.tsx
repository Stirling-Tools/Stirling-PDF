import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Card, EmptyState, Skeleton } from "@shared/components";
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
  const [extra, setExtra] = useState<null | "docs" | "schedule" | "trial">(null);

  const data = snap ?? (state.loading ? null : state.data);
  const started = data?.dealId != null;
  const stage = data?.stage;
  const latest = data?.latestQuote ?? null;
  const isDraft = !latest || latest.status === "draft";
  const isIssued = latest?.status === "sent" || latest?.status === "open";

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
      setError(t("procurement.milestone.downloadError"));
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
        {error && (
          <Banner
            tone="danger"
            title={t("procurement.error.title")}
            onDismiss={() => setError(null)}
          >
            {error}
          </Banner>
        )}

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
                {latest.config.businessName && (
                  <p className="portal-proc__milestone-for">
                    {t("procurement.milestone.preparedFor", {
                      company: latest.config.businessName,
                    })}
                  </p>
                )}
                <p className="portal-proc__subtitle">
                  {t("procurement.milestone.description")}
                </p>
                <ul className="portal-qb__lines portal-proc__milestone-lines">
                  {latest.lineItems.map((li) => (
                    <li key={li.key} data-kind={li.kind}>
                      <span>{li.label}</span>
                      <span>
                        {li.kind === "INCLUDED"
                          ? t("procurement.builder.included")
                          : money(li.amountMinor, latest.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
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
                  <Button
                    variant="outline"
                    loading={downloading}
                    onClick={onDownloadPdf}
                  >
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

            {!editing && stage === "procurement" && latest && (
              <Card padding="loose">
                <h3 className="portal-proc__builder-title">
                  {t("procurement.payment.title")}
                </h3>
                <p className="portal-proc__subtitle">
                  {t("procurement.payment.description")}
                </p>
                {(latest.invoiceUrl || invoicePdf) && (
                  <div className="portal-proc__payment-actions">
                    {latest.invoiceUrl && (
                      <Button
                        variant="gradient"
                        accent="purple"
                        onClick={() =>
                          window.open(latest.invoiceUrl!, "_blank", "noopener")
                        }
                      >
                        {t("procurement.payment.viewInvoice")}
                      </Button>
                    )}
                    {invoicePdf && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          window.open(invoicePdf, "_blank", "noopener")
                        }
                      >
                        {t("procurement.payment.downloadInvoice")}
                      </Button>
                    )}
                  </div>
                )}
                <div className="portal-proc__reset">
                  <button
                    type="button"
                    onClick={() => run(goLive)}
                    disabled={busy}
                  >
                    {t("procurement.payment.simulate")}
                  </button>
                </div>
              </Card>
            )}

            {!editing && stage === "active" && (
              <Card padding="loose">
                <span className="portal-proc__eyebrow">
                  {t("procurement.live.eyebrow")}
                </span>
                <h3 className="portal-proc__builder-title">
                  {t("procurement.live.title")}
                </h3>
                <p className="portal-proc__subtitle">
                  {t("procurement.live.description")}
                </p>
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
