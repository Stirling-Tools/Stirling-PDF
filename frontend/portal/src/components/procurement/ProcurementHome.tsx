import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState, Skeleton } from "@shared/components";
import { getSupabaseClient } from "@shared/auth/supabase/supabaseClient";
import { useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  acceptQuote,
  fetchSnapshot,
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

/**
 * The procurement experience on Home: a compact deal-status hero (active) or the enterprise
 * upsell (not started), both expanding into the full-screen takeover modal that holds the whole
 * journey. Rendered on Home and at /procurement (autoOpen → opens the modal on load, so a direct
 * link starts the journey). Gated on a linked account.
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
  const data = snap ?? (state.loading ? null : state.data);
  const started = data?.dealId != null;
  const accepted = data?.latestQuote?.status === "accepted";

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  async function onStartTrial() {
    setBusy(true);
    try {
      setSnap(await startTrial());
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    setBusy(true);
    try {
      setSnap(await resetProcurement());
    } finally {
      setBusy(false);
    }
  }

  async function onAcceptQuote(quote: QuoteResult) {
    setBusy(true);
    try {
      await acceptQuote(quote.quoteId);
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: res } = await supabase.functions.invoke(
          quote.checkoutFunction,
          { body: { quote_id: quote.quoteId } },
        );
        const url = (res as { url?: string } | null)?.url;
        if (url) {
          window.location.href = url;
          return;
        }
      }
      setSnap(await fetchSnapshot());
    } finally {
      setBusy(false);
    }
  }

  // ---- compact Home surface ------------------------------------------------
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

        {isLinked && state.loading && !data && (
          <Skeleton height="10rem" />
        )}

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
              <StageStepper journey={JOURNEY} currentStage={data!.stage!} />
            </div>

            {!accepted &&
              (data!.stage === "trial" || data!.stage === "quote") && (
                <QuoteBuilder deployment="cloud" onAccept={onAcceptQuote} />
              )}

            {accepted && (
              <Card padding="loose">
                <h3 className="portal-proc__builder-title">
                  {t("procurement.payment.title")}
                </h3>
                <p className="portal-proc__subtitle">
                  {t("procurement.payment.description")}
                </p>
                <Button
                  variant="gradient"
                  accent="purple"
                  loading={busy}
                  onClick={() =>
                    data?.latestQuote && onAcceptQuote(data.latestQuote)
                  }
                >
                  {t("procurement.payment.cta")}
                </Button>
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
