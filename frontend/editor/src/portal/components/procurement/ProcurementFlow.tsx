import { useTranslation } from "react-i18next";
import { Banner, Button, EmptyState, Skeleton } from "@app/ui";
import { useUI } from "@portal/contexts/UIContext";
import { useLinkedAccountEmail } from "@portal/hooks/useLinkedAccountEmail";
import { JOURNEY } from "@portal/api/procurement";
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
import type { ProcurementController } from "@portal/components/procurement/useProcurement";

/**
 * The procurement takeover flow: the full-screen journey modal (quote builder →
 * milestone → agreement → payment → live) plus the key-documents, schedule-call,
 * and trial-management modals. Driven entirely by a shared ProcurementController
 * so it can sit next to a deal-status hero rendered elsewhere (e.g. inside the
 * tier hero card on Home).
 */
export function ProcurementFlow({
  controller,
}: {
  controller: ProcurementController;
}) {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  const scheduleEmail = useLinkedAccountEmail();
  const {
    isLinked,
    loading,
    data,
    started,
    stage,
    latest,
    isIssued,
    isDraft,
    busy,
    downloading,
    error,
    setError,
    open,
    setOpen,
    editing,
    setEditing,
    extra,
    setExtra,
    invoicePdf,
    onExtendTrial,
    onReset,
    onGenerate,
    onAcceptQuote,
    onAgree,
    onGoLive,
    onDownloadPdf,
  } = controller;

  return (
    <>
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

        {isLinked && (loading || !started) && <Skeleton height="10rem" />}

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
                onSimulate={onGoLive}
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
        email={scheduleEmail}
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
