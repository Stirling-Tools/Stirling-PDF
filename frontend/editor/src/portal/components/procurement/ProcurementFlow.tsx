import { useTranslation } from "react-i18next";
import { Banner, Button, EmptyState, Skeleton } from "@app/ui";
import { useUI } from "@portal/contexts/UIContext";
import { useLinkedAccountEmail } from "@portal/hooks/useLinkedAccountEmail";
import { FLOW_JOURNEY } from "@portal/api/procurement";
import { ProcurementAgreement } from "@portal/components/procurement/ProcurementAgreement";
import {
  LicenseModal,
  ScheduleCallModal,
  TrialManageModal,
  TrialSetupModal,
} from "@portal/components/procurement/ProcurementExtras";
import { ProcurementModal } from "@portal/components/procurement/ProcurementModal";
import {
  LiveStageCard,
  PaymentStageCard,
} from "@portal/components/procurement/ProcurementStages";
import { QuoteBuilder } from "@portal/components/procurement/QuoteBuilder";
import { StageStepper } from "@portal/components/procurement/StageStepper";
import type { ProcurementController } from "@portal/components/procurement/useProcurement";

/**
 * The procurement takeover flow: the full-screen journey modal (quote builder →
 * quote & agreement → payment → live) plus the licence-key, schedule-call, trial-setup,
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
    downloadingLicense,
    error,
    setError,
    open,
    setOpen,
    editing,
    setEditing,
    extra,
    setExtra,
    invoicePdf,
    onConfirmSetup,
    onExtendTrial,
    onReset,
    onGenerate,
    onAgree,
    onDownloadPdf,
    onDownloadOfflineLicense,
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
              <StageStepper journey={FLOW_JOURNEY} currentStage={stage!} />
            </div>

            {(editing ||
              (isDraft && (stage === "trial" || stage === "quote"))) && (
              <QuoteBuilder
                deployment={data?.deployment ?? "cloud"}
                seats={data?.seats ?? 0}
                initial={latest?.config}
                onGenerate={onGenerate}
              />
            )}

            {/* Quote + agreement are one step: review the itemised quote and the agreement, then
                accept straight into a committed subscription. Once accepted you can't go back.
                ("security" is the retired agreement stage — still handled so an older deal that
                stopped there isn't left blank.) */}
            {!editing &&
              isIssued &&
              (stage === "quote" || stage === "security") &&
              latest && (
                <ProcurementAgreement
                  quote={latest}
                  busy={busy}
                  downloading={downloading}
                  onAgree={onAgree}
                  onDownload={onDownloadPdf}
                  onEdit={() => setEditing(true)}
                />
              )}

            {!editing && stage === "procurement" && latest && (
              <PaymentStageCard
                invoiceUrl={latest.invoiceUrl}
                invoicePdf={latest.invoicePdf ?? invoicePdf}
              />
            )}

            {!editing && stage === "active" && <LiveStageCard />}
          </>
        )}
      </ProcurementModal>

      <TrialSetupModal
        open={extra === "setup"}
        onClose={() => setExtra(null)}
        busy={busy}
        onConfirm={onConfirmSetup}
      />
      {data?.licenseKey && (
        <LicenseModal
          open={extra === "license"}
          onClose={() => setExtra(null)}
          licenseKey={data.licenseKey}
          offlineAvailable={data.deployment === "airgap"}
          downloadingLicense={downloadingLicense}
          onDownloadOffline={onDownloadOfflineLicense}
          trial={data.stage !== "procurement" && data.stage !== "active"}
        />
      )}
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
