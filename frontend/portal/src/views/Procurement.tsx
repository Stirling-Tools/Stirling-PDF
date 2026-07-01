import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusBadge,
} from "@shared/components";
import { getSupabaseClient } from "@shared/auth/supabase/supabaseClient";
import { useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  acceptQuote,
  fetchSnapshot,
  JOURNEY,
  startTrial,
  type ProcurementSnapshot,
  type QuoteResult,
} from "@portal/api/procurement";
import { StageStepper } from "@portal/components/procurement/StageStepper";
import { QuoteBuilder } from "@portal/components/procurement/QuoteBuilder";
import "@portal/views/Procurement.css";

/**
 * Procurement: the enterprise commercial journey, gated on a linked account. Unlinked buyers get a
 * "link to begin" prompt; linked-but-not-started buyers get the trial start; from there the deal
 * snapshot drives the stepper, the quote builder, and (on accept) the Stripe checkout handoff.
 * Loading /procurement directly is the same entry point as the marketing CTAs.
 */
export function Procurement() {
  const { t } = useTranslation();
  const { isLinked } = useLink();
  const { openLinkModal } = useUI();

  const state = useAsync<ProcurementSnapshot | null>(
    () => (isLinked ? fetchSnapshot() : Promise.resolve(null)),
    [isLinked],
  );
  const [snap, setSnap] = useState<ProcurementSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const data = snap ?? (state.loading ? null : state.data);

  // The Usage "Build your Enterprise quote" CTA deep-links here; jump straight to the builder
  // (building a quote lazily creates the deal).
  const startQuote =
    new URLSearchParams(window.location.search).get("start") === "quote";

  async function onStartTrial() {
    setBusy(true);
    try {
      setSnap(await startTrial());
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

  const started = data?.dealId != null;
  const accepted = data?.latestQuote?.status === "accepted";
  const showBuilder =
    (!started && startQuote) ||
    (started &&
      !accepted &&
      (data?.stage === "trial" || data?.stage === "quote"));

  return (
    <div className="portal-proc">
      <header className="portal-proc__header">
        <div>
          <h1 className="portal-proc__title">{t("procurement.title")}</h1>
          <p className="portal-proc__subtitle">{t("procurement.subtitle")}</p>
        </div>
        <StatusBadge tone="purple" size="md">
          {t("procurement.enterpriseBadge")}
        </StatusBadge>
      </header>

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
        <Card padding="loose">
          <Skeleton width="12rem" height="1.25rem" />
          <Skeleton height="8rem" />
        </Card>
      )}

      {isLinked && !state.loading && !started && !startQuote && (
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
        <Card padding="loose" className="portal-proc__journey-stepper">
          <StageStepper journey={JOURNEY} currentStage={data!.stage!} />
          {data!.stage === "trial" && data!.trialEndsAt && (
            <div className="portal-proc__trial">
              <span className="portal-proc__trial-title">
                {t("procurement.journey.trialTitle")}
              </span>
              <span className="portal-proc__trial-dim">
                {t("procurement.journey.daysLeft", {
                  count: daysLeft(data!.trialEndsAt),
                })}
              </span>
            </div>
          )}
        </Card>
      )}

      {isLinked && showBuilder && (
        <QuoteBuilder deployment="cloud" onAccept={onAcceptQuote} />
      )}

      {isLinked && started && accepted && (
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
            onClick={() => data?.latestQuote && onAcceptQuote(data.latestQuote)}
          >
            {t("procurement.payment.cta")}
          </Button>
        </Card>
      )}
    </div>
  );
}

function daysLeft(iso: string): number {
  const end = new Date(iso).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}
