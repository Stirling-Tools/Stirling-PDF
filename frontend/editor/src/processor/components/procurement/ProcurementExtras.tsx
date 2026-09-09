import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@app/ui";
import {
  fetchLegalDocument,
  recordLegalConsent,
  type ProcurementSnapshot,
  type TrialSetupDetails,
} from "@processor/api/procurement";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";
import { CalendlyInline } from "@processor/components/procurement/CalendlyInline";
import { LicensePanel } from "@processor/components/procurement/ProcurementStages";
import { FlowModal } from "@processor/components/shared/FlowModal";
import { useAsync } from "@processor/hooks/useAsync";
import { openApiUrl } from "@processor/api/externalUrl";
import "@processor/views/Procurement.css";

/**
 * Small centred dialogs that hang off the deal-status hero's quick actions — the licence key,
 * schedule a call, trial management, and trial setup. Schedule a call embeds the live Calendly
 * scheduler. The shells and wiring are real so the hero behaves like the marketing prototype.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SideModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  headerAside,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Sits on the title row, before the close button (e.g. a "Step 1 of 2" badge). */
  headerAside?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <FlowModal
      open={open}
      onClose={onClose}
      label={title}
      size={wide ? "lg" : "md"}
      footer={footer}
      header={
        <>
          <div className="processor-sidemodal__title-row">
            <h2 className="processor-sidemodal__title">{title}</h2>
            {headerAside}
          </div>
          {subtitle && <p className="processor-sidemodal__sub">{subtitle}</p>}
        </>
      }
    >
      {children}
    </FlowModal>
  );
}

/**
 * Reader for a versioned legal document (EULA, SLA exhibit, subprocessors), fetched from the
 * backend registry and rendered as markdown. Open when {@code docId} is set. Drafts are badged.
 */
export function LegalDocumentModal({
  docId,
  onClose,
}: {
  docId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, loading } = useAsync(
    () => (docId ? fetchLegalDocument(docId) : Promise.resolve(null)),
    [docId],
  );
  return (
    <SideModal
      open={docId !== null}
      onClose={onClose}
      wide
      title={data?.displayName ?? t("processor.legal.title")}
      subtitle={
        data
          ? data.status !== "final"
            ? t("processor.legal.draft", { label: data.versionLabel })
            : data.versionLabel
          : undefined
      }
    >
      {loading && (
        <p className="processor-sidemodal__text">
          {t("processor.legal.loading")}
        </p>
      )}
      {!loading && !data && (
        <p className="processor-sidemodal__text">
          {t("processor.legal.loadError")}
        </p>
      )}
      {data && (
        <div className="processor-agreement__md">
          <Markdown remarkPlugins={[remarkGfm]}>{data.markdown}</Markdown>
        </div>
      )}
    </SideModal>
  );
}

// ── Documents ────────────────────────────────────────────────────────────────
/**
 * The deal's paperwork in one place, reachable throughout the journey (not tied to the current
 * stage): the enterprise agreement, the quote, the invoice, and the reference documents (EULA, SLA
 * exhibit, subprocessors). Each row downloads or views the real artifact when it's available, and
 * reads as "available later" until then. The per-stage download buttons remain the primary path;
 * this is the secondary, always-on reference.
 */
export function DocumentsModal({
  open,
  onClose,
  agreementVersion,
  downloadingAgreement,
  onDownloadAgreement,
  onViewAgreement,
  quoteAvailable,
  downloadingQuote,
  onDownloadQuote,
  invoiceUrl,
  invoicePdf,
}: {
  open: boolean;
  onClose: () => void;
  agreementVersion?: string | null;
  downloadingAgreement?: boolean;
  onDownloadAgreement: () => void;
  /** Jump to the agreement/sign stage in the flow (used before it's signed). */
  onViewAgreement: () => void;
  quoteAvailable: boolean;
  downloadingQuote?: boolean;
  onDownloadQuote: () => void;
  invoiceUrl?: string | null;
  invoicePdf?: string | null;
}) {
  const { t } = useTranslation();
  const [legalDoc, setLegalDoc] = useState<string | null>(null);
  const invoice = invoiceUrl || invoicePdf || null;

  return (
    <>
      <SideModal
        open={open}
        onClose={onClose}
        title={t("processor.procurement.documents.title")}
        subtitle={t("processor.procurement.documents.subtitle")}
      >
        <ul className="processor-docmodal">
          <DocItem
            name={t("processor.procurement.documents.agreement")}
            sub={
              agreementVersion ??
              t("processor.procurement.documents.agreementSub")
            }
            action={
              agreementVersion
                ? {
                    label: t("processor.procurement.documents.download"),
                    onClick: onDownloadAgreement,
                    loading: downloadingAgreement,
                  }
                : quoteAvailable
                  ? {
                      label: t("processor.procurement.documents.view"),
                      onClick: onViewAgreement,
                    }
                  : {
                      unavailable: t(
                        "processor.procurement.documents.laterQuote",
                      ),
                    }
            }
          />
          <DocItem
            name={t("processor.procurement.documents.quote")}
            sub={t("processor.procurement.documents.quoteSub")}
            action={
              quoteAvailable
                ? {
                    label: t("processor.procurement.documents.download"),
                    onClick: onDownloadQuote,
                    loading: downloadingQuote,
                  }
                : {
                    unavailable: t(
                      "processor.procurement.documents.laterQuote",
                    ),
                  }
            }
          />
          <DocItem
            name={t("processor.procurement.documents.invoice")}
            sub={t("processor.procurement.documents.invoiceSub")}
            action={
              invoice
                ? {
                    label: t("processor.procurement.documents.view"),
                    onClick: () => openApiUrl(invoice),
                  }
                : {
                    unavailable: t(
                      "processor.procurement.documents.laterInvoice",
                    ),
                  }
            }
          />
          <DocItem
            name={t("processor.procurement.documents.eula")}
            sub={t("processor.procurement.documents.eulaSub")}
            action={{
              label: t("processor.procurement.documents.view"),
              onClick: () => setLegalDoc("eula"),
            }}
          />
          <DocItem
            name={t("processor.procurement.documents.sla")}
            sub={t("processor.procurement.documents.slaSub")}
            action={{
              label: t("processor.procurement.documents.view"),
              onClick: () => setLegalDoc("sla"),
            }}
          />
          <DocItem
            name={t("processor.procurement.documents.subprocessors")}
            sub={t("processor.procurement.documents.subprocessorsSub")}
            action={{
              label: t("processor.procurement.documents.view"),
              onClick: () => setLegalDoc("subprocessors"),
            }}
          />
        </ul>
      </SideModal>
      <LegalDocumentModal docId={legalDoc} onClose={() => setLegalDoc(null)} />
    </>
  );
}

/** One row in the Documents list: name + sub on the left, an action button or a muted note. */
function DocItem({
  name,
  sub,
  action,
}: {
  name: string;
  sub: string;
  action:
    | { label: string; onClick: () => void; loading?: boolean }
    | { unavailable: string };
}) {
  return (
    <li className="processor-docmodal__row">
      <div className="processor-docmodal__text">
        <span className="processor-docmodal__name">{name}</span>
        <span className="processor-docmodal__sub">{sub}</span>
      </div>
      {"unavailable" in action ? (
        <span className="processor-docmodal__later">{action.unavailable}</span>
      ) : (
        <Button
          variant="secondary"
          loading={action.loading}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </li>
  );
}

// ── Licence key ──────────────────────────────────────────────────────────────
export function LicenseModal({
  open,
  onClose,
  licenseKey,
  offlineAvailable,
  downloadingLicense,
  onDownloadOffline,
  trial = false,
}: {
  open: boolean;
  onClose: () => void;
  licenseKey: string;
  offlineAvailable: boolean;
  downloadingLicense: boolean;
  onDownloadOffline: () => void;
  /** Licence is still the trial one (not yet upgraded on accept) — the downloadable .lic is a
   * snapshot, so warn that it must be re-downloaded once the agreement is in place. */
  trial?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SideModal
      open={open}
      onClose={onClose}
      title={t("processor.procurement.license.title")}
      subtitle={t("processor.procurement.license.subtitle")}
    >
      <LicensePanel
        licenseKey={licenseKey}
        offlineAvailable={offlineAvailable}
        downloadingLicense={downloadingLicense}
        onDownloadOffline={onDownloadOffline}
      />
      {offlineAvailable && trial && (
        <p className="processor-proc__license-hint">
          {t("processor.procurement.license.trialFileHint")}
        </p>
      )}
    </SideModal>
  );
}

// ── Schedule a call ──────────────────────────────────────────────────────────
export function ScheduleCallModal({
  open,
  onClose,
  email,
}: {
  open: boolean;
  onClose: () => void;
  /** Linked account's email; prefills the Calendly booking form. */
  email?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <SideModal
      open={open}
      onClose={onClose}
      title={t("processor.procurement.schedule.title")}
      subtitle={t("processor.procurement.schedule.subtitle")}
      wide
    >
      <CalendlyInline email={email} />
    </SideModal>
  );
}

// ── Trial setup ────────────────────────────────────────────────────────────
const DEPLOYMENTS = ["cloud", "selfhost", "airgap"] as const;

/**
 * Captured before the trial starts: where the buyer will run Stirling (which drives the deployment
 * fee and, for air-gapped, the offline licence) and their team size. Both seed the quote builder so
 * it opens on their real environment; the trial only begins once this is confirmed.
 */
export function TrialSetupModal({
  open,
  onClose,
  busy,
  email,
  onScheduleCall,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  /** Linked-account email, prefilled as the work email on the details step. */
  email?: string;
  /** Open the scheduler — the step-1 escape hatch for buyers who want to talk first. */
  onScheduleCall: () => void;
  onConfirm: (
    deployment: string,
    seats: number,
    details: TrialSetupDetails,
  ) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [deployment, setDeployment] = useState<string>("cloud");
  const [seats, setSeats] = useState("");
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [eula, setEula] = useState(false);
  const [legalDoc, setLegalDoc] = useState<string | null>(null);

  // Reset to defaults each time the dialog opens, so a cancelled setup doesn't linger.
  useEffect(() => {
    if (open) {
      setStep(0);
      setDeployment("cloud");
      setSeats("");
      setContactName("");
      setBusinessName("");
      setContactEmail(email ?? "");
      setInviteEmails("");
      setEula(false);
    }
  }, [open, email]);

  // The buying entity is what the quote and agreement are drawn against, so it is required here
  // rather than deferred to the quote; invites are genuinely optional.
  const detailsValid =
    contactName.trim().length > 0 &&
    businessName.trim().length > 0 &&
    EMAIL_RE.test(contactEmail.trim());

  const confirm = () => {
    void recordLegalConsent("eula", "trial"); // clickwrap consent, best-effort
    onConfirm(deployment, Math.max(0, Number(seats) || 0), {
      businessName: businessName.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      inviteEmails: inviteEmails.trim(),
    });
  };

  return (
    <>
      <SideModal
        open={open}
        onClose={onClose}
        title={t("processor.procurement.setup.title")}
        subtitle={t(
          step === 0
            ? "processor.procurement.setup.subtitle"
            : "processor.procurement.setup.subtitleDetails",
        )}
        headerAside={
          <span className="processor-stepmodal__step">
            {t("processor.procurement.setup.stepOf", { n: step + 1, total: 2 })}
          </span>
        }
        footer={
          step === 0 ? (
            <>
              <span className="processor-sidemodal__foot-hint">
                {t("processor.procurement.setup.talkFirst")}{" "}
                <button
                  type="button"
                  className="processor-legal__link"
                  onClick={onScheduleCall}
                >
                  {t("processor.procurement.setup.scheduleCall")}
                </button>
              </span>
              <Button
                variant="primary"
                disabled={Number(seats) <= 0}
                onClick={() => setStep(1)}
              >
                {t("processor.procurement.setup.continue")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStep(0)}>
                {t("processor.procurement.setup.back")}
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!eula || !detailsValid}
                onClick={confirm}
              >
                {t("processor.procurement.setup.start")}
              </Button>
            </>
          )
        }
      >
        <StepModalHeader step={step + 1} total={2} />

        {step === 0 && (
          <>
            <label className="processor-qb__field">
              <span className="processor-qb__field-label">
                {t("processor.procurement.setup.seats")}
              </span>
              <input
                type="number"
                min={0}
                placeholder={t("processor.procurement.setup.seatsPlaceholder")}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
              />
            </label>
            <label className="processor-qb__field">
              <span className="processor-qb__field-label">
                {t("processor.procurement.setup.deployment")}
              </span>
              <div className="processor-qb__opts processor-qb__opts--across">
                {DEPLOYMENTS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="processor-qb__opt"
                    data-on={deployment === d || undefined}
                    onClick={() => setDeployment(d)}
                  >
                    <span className="processor-qb__opt-title">
                      {t(`processor.procurement.setup.${d}`)}
                    </span>
                    <span className="processor-qb__opt-sub">
                      {t(`processor.procurement.setup.${d}Sub`)}
                    </span>
                  </button>
                ))}
              </div>
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <div className="processor-qb__row">
              <label className="processor-qb__field">
                <span className="processor-qb__field-label">
                  {t("processor.procurement.setup.fullName")}
                </span>
                <input
                  value={contactName}
                  placeholder={t(
                    "processor.procurement.setup.fullNamePlaceholder",
                  )}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </label>
              <label className="processor-qb__field">
                <span className="processor-qb__field-label">
                  {t("processor.procurement.setup.businessName")}
                </span>
                <input
                  value={businessName}
                  placeholder={t(
                    "processor.procurement.setup.businessNamePlaceholder",
                  )}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </label>
            </div>
            <label className="processor-qb__field">
              <span className="processor-qb__field-label">
                {t("processor.procurement.setup.workEmail")}
              </span>
              <input
                type="email"
                value={contactEmail}
                placeholder={t(
                  "processor.procurement.setup.workEmailPlaceholder",
                )}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </label>
            <label className="processor-qb__field">
              <span className="processor-qb__field-label">
                {t("processor.procurement.setup.invites")}
              </span>
              <input
                value={inviteEmails}
                placeholder={t(
                  "processor.procurement.setup.invitesPlaceholder",
                )}
                onChange={(e) => setInviteEmails(e.target.value)}
              />
            </label>

            <label className="processor-qb__eula">
              <input
                type="checkbox"
                checked={eula}
                onChange={(e) => setEula(e.target.checked)}
              />
              <span>
                {t("processor.procurement.setup.eula")}{" "}
                <button
                  type="button"
                  className="processor-legal__link"
                  onClick={() => setLegalDoc("eula")}
                >
                  {t("processor.procurement.setup.viewEula")}
                </button>
              </span>
            </label>
          </>
        )}
      </SideModal>
      <LegalDocumentModal docId={legalDoc} onClose={() => setLegalDoc(null)} />
    </>
  );
}

// ── Trial management ─────────────────────────────────────────────────────────
export function TrialManageModal({
  open,
  onClose,
  snapshot,
  busy,
  onExtend,
  onCancel,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: ProcurementSnapshot;
  busy: boolean;
  onExtend: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const ends = snapshot.trialEndsAt
    ? new Date(snapshot.trialEndsAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const maxed = snapshot.trialExtensionsUsed >= 2;
  return (
    <SideModal
      open={open}
      onClose={onClose}
      title={t("processor.procurement.trial.title")}
      subtitle={
        ends
          ? t("processor.procurement.trial.subtitle", { date: ends })
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            className="processor-sidemodal__ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {t("processor.procurement.trial.cancel")}
          </button>
          <Button
            variant="primary"
            loading={busy}
            disabled={maxed}
            onClick={onExtend}
          >
            {maxed
              ? t("processor.procurement.trial.maxed")
              : t("processor.procurement.trial.extend")}
          </Button>
        </>
      }
    >
      <p className="processor-sidemodal__text">
        {maxed
          ? t("processor.procurement.trial.bodyMaxed")
          : t("processor.procurement.trial.body")}
      </p>
    </SideModal>
  );
}
