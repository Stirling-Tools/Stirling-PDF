import { useTranslation } from "react-i18next";
import { Banner } from "@editor/ui";
import { COMPARE_PLANS_ANCHOR } from "@editor/billing/compareAnchor";
import { useUI } from "@editor/portal/contexts/UIContext";
import { useLinkedAccountEmail } from "@editor/portal/hooks/useLinkedAccountEmail";
import { ProcurementAgreement } from "@editor/portal/components/procurement/ProcurementAgreement";
import { ScheduleCallModal } from "@processor/components/procurement/ProcurementExtras";
import { QuoteBuilder } from "@editor/portal/components/procurement/QuoteBuilder";
import type { ProcurementController } from "@editor/portal/components/procurement/useProcurement";

/** Which long step, if any, the deal is on: building its quote or signing its agreement. */
export function procurementFlowStep(
  controller: ProcurementController,
): "builder" | "agreement" | null {
  const { started, stage, editing, latest } = controller;
  // The builder spans the whole quote stage, not just the draft part of it: issuing turns its last
  // step into the review of the issued paper rather than handing off to a separate card.
  if (started && (editing || stage === "trial" || stage === "quote"))
    return "builder";
  if (started && !editing && stage === "security" && latest != null)
    return "agreement";
  return null;
}

/**
 * The journey's two long steps, building a quote and signing the agreement, shown within the deal
 * at their stage. Booking a call opens here too: the agreement's "request changes" leads to it.
 */
export function ProcurementFlow({
  controller,
}: {
  controller: ProcurementController;
}) {
  const { t } = useTranslation();
  const scheduleEmail = useLinkedAccountEmail();
  const { openSettings } = useUI();
  const {
    data,
    latest,
    isIssued,
    busy,
    downloading,
    error,
    setError,
    open,
    setOpen,
    editing,
    extra,
    setExtra,
    onGenerate,
    onAgree,
    onDownloadPdf,
  } = controller;

  const step = procurementFlowStep(controller);
  const builderShowing = step === "builder";
  const agreementShowing = step === "agreement";

  return (
    <>
      {open && step && (
        <section
          className="portal-procflow"
          aria-label={t("portal.procurement.title")}
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

          {builderShowing && data && (
            <QuoteBuilder
              deployment={data?.deployment ?? "cloud"}
              seats={data?.seats ?? 0}
              email={scheduleEmail}
              dealDetails={
                data
                  ? {
                      businessName: data.businessName,
                      contactName: data.contactName,
                      contactEmail: data.contactEmail,
                    }
                  : undefined
              }
              initial={latest?.config}
              eulaAlreadyAgreed={data?.trialStartedAt != null}
              minAnnualMinor={data.minAnnualNetMinor ?? 0}
              rates={data.rateCard}
              onScheduleCall={() => setExtra("schedule")}
              onComparePlans={() =>
                openSettings("billing", COMPARE_PLANS_ANCHOR)
              }
              onClose={() => setOpen(false)}
              onGenerate={onGenerate}
              // Null while re-editing: the buyer asked for the form, not the paper they just left.
              issued={!editing && isIssued ? latest : null}
              downloading={downloading}
              onDownload={onDownloadPdf}
            />
          )}

          {/* Signing accepts the quote into a committed subscription (Stripe). */}
          {agreementShowing && latest && (
            <ProcurementAgreement
              quote={latest}
              busy={busy}
              onAgree={onAgree}
              onRequestChanges={() => {
                setOpen(false);
                setExtra("schedule");
              }}
              onClose={() => setOpen(false)}
            />
          )}
        </section>
      )}

      <ScheduleCallModal
        open={extra === "schedule"}
        onClose={() => setExtra(null)}
        email={scheduleEmail}
      />
    </>
  );
}
