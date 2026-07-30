import { useTranslation } from "react-i18next";
import { Banner, Button, EmptyState, Skeleton } from "@app/ui";
import { useUI } from "@portal/contexts/UIContext";
import { useLinkedAccountEmail } from "@portal/hooks/useLinkedAccountEmail";
import { ProcurementAgreement } from "@portal/components/procurement/ProcurementAgreement";
import {
  DocumentsModal,
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
    downloadingAgreement,
    onDownloadSignedAgreement,
  } = controller;

  // The builder owns the dialog's chrome while it is the visible step. It spans the whole quote
  // stage now, not just the draft part of it: issuing turns its last step into the review of the
  // issued paper rather than handing off to a separate card.
  const builderShowing =
    isLinked && started && (editing || stage === "trial" || stage === "quote");
  const agreementShowing =
    isLinked && started && !editing && stage === "security" && latest != null;
  // Both of these name their own document in the header and carry its download there, so the shell
  // must not stack a second header (nor a second close) above them.
  const ownsHeader = builderShowing || agreementShowing;

  return (
    <>
      <ProcurementModal
        open={open}
        onClose={() => setOpen(false)}
        title={t("portal.procurement.title")}
        subtitle={t("portal.procurement.subtitle")}
        // The builder and the agreement render their own heading and close; the payment and live
        // steps have none, so they keep the shell's header.
        headerless={ownsHeader}
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
              <Button variant="primary" onClick={() => openLinkModal()}>
                {t("portal.procurement.link.cta")}
              </Button>
            }
          />
        )}

        {isLinked && (loading || !started) && <Skeleton height="10rem" />}

        {isLinked && started && (
          <>
            {builderShowing && (
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
                onClose={() => setOpen(false)}
                onGenerate={onGenerate}
                // Null while re-editing: the buyer asked for the form, not the paper they just left.
                issued={!editing && isIssued ? latest : null}
                downloading={downloading}
                onDownload={onDownloadPdf}
              />
            )}

            {/* Agreement step: review and sign the enterprise agreement. Signing accepts the quote
                into a committed subscription (Stripe). */}
            {agreementShowing && latest && (
              <ProcurementAgreement
                quote={latest}
                busy={busy}
                downloading={downloading}
                onAgree={onAgree}
                onDownload={onDownloadPdf}
                onEdit={() => setEditing(true)}
                onClose={() => setOpen(false)}
              />
            )}

            {!editing && stage === "procurement" && latest && (
              <PaymentStageCard
                invoiceUrl={latest.invoiceUrl}
                invoicePdf={latest.invoicePdf ?? invoicePdf}
                signedAgreementVersion={data?.agreementSignedVersion}
                downloadingAgreement={downloadingAgreement}
                onDownloadSignedAgreement={onDownloadSignedAgreement}
              />
            )}

            {!editing && stage === "active" && (
              <LiveStageCard
                signedAgreementVersion={data?.agreementSignedVersion}
                downloadingAgreement={downloadingAgreement}
                onDownloadSignedAgreement={onDownloadSignedAgreement}
              />
            )}
          </>
        )}
      </ProcurementModal>

      <TrialSetupModal
        open={extra === "setup"}
        onClose={() => setExtra(null)}
        busy={busy}
        email={scheduleEmail ?? undefined}
        onScheduleCall={() => setExtra("schedule")}
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
      <DocumentsModal
        open={extra === "documents"}
        onClose={() => setExtra(null)}
        agreementVersion={data?.agreementSignedVersion}
        downloadingAgreement={downloadingAgreement}
        onDownloadAgreement={onDownloadSignedAgreement}
        onViewAgreement={() => {
          setExtra(null);
          setEditing(false);
          setOpen(true);
        }}
        quoteAvailable={!!latest?.stripeQuoteId}
        downloadingQuote={downloading}
        onDownloadQuote={onDownloadPdf}
        invoiceUrl={latest?.invoiceUrl}
        invoicePdf={latest?.invoicePdf ?? invoicePdf}
      />
    </>
  );
}
