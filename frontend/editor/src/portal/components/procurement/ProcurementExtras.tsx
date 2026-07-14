import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@app/ui";
import {
  fetchLegalDocument,
  recordLegalConsent,
  type ProcurementSnapshot,
} from "@portal/api/procurement";
import { CalendlyInline } from "@portal/components/procurement/CalendlyInline";
import { LicensePanel } from "@portal/components/procurement/ProcurementStages";
import { useFocusTrap } from "@portal/components/procurement/ProcurementModal";
import { useAsync } from "@portal/hooks/useAsync";
import "@portal/views/Procurement.css";

/**
 * Small centred dialogs that hang off the deal-status hero's quick actions — the licence key,
 * schedule a call, trial management, and trial setup. Schedule a call embeds the live Calendly
 * scheduler. The shells and wiring are real so the hero behaves like the marketing prototype.
 */

function SideModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="portal-sidemodal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={trapRef}
        className={`portal-sidemodal__panel${wide ? " portal-sidemodal__panel--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <button
          type="button"
          className="portal-procmodal__close"
          onClick={onClose}
          aria-label={t("portal.procurement.modal.close")}
        >
          ✕
        </button>
        <div className="portal-sidemodal__header">
          <h3 className="portal-sidemodal__title">{title}</h3>
          {subtitle && <p className="portal-sidemodal__sub">{subtitle}</p>}
        </div>
        <div className="portal-sidemodal__body">{children}</div>
        {footer && <div className="portal-sidemodal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
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
      title={data?.displayName ?? t("portal.legal.title")}
      subtitle={
        data
          ? data.status !== "final"
            ? t("portal.legal.draft", { label: data.versionLabel })
            : data.versionLabel
          : undefined
      }
    >
      {loading && (
        <p className="portal-sidemodal__text">{t("portal.legal.loading")}</p>
      )}
      {!loading && !data && (
        <p className="portal-sidemodal__text">{t("portal.legal.loadError")}</p>
      )}
      {data && (
        <div className="portal-agreement__md">
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
        title={t("portal.procurement.documents.title")}
        subtitle={t("portal.procurement.documents.subtitle")}
      >
        <ul className="portal-docmodal">
          <DocItem
            name={t("portal.procurement.documents.agreement")}
            sub={
              agreementVersion ?? t("portal.procurement.documents.agreementSub")
            }
            action={
              agreementVersion
                ? {
                    label: t("portal.procurement.documents.download"),
                    onClick: onDownloadAgreement,
                    loading: downloadingAgreement,
                  }
                : { unavailable: t("portal.procurement.documents.laterSigned") }
            }
          />
          <DocItem
            name={t("portal.procurement.documents.quote")}
            sub={t("portal.procurement.documents.quoteSub")}
            action={
              quoteAvailable
                ? {
                    label: t("portal.procurement.documents.download"),
                    onClick: onDownloadQuote,
                    loading: downloadingQuote,
                  }
                : { unavailable: t("portal.procurement.documents.laterQuote") }
            }
          />
          <DocItem
            name={t("portal.procurement.documents.invoice")}
            sub={t("portal.procurement.documents.invoiceSub")}
            action={
              invoice
                ? {
                    label: t("portal.procurement.documents.view"),
                    onClick: () => window.open(invoice, "_blank", "noopener"),
                  }
                : {
                    unavailable: t("portal.procurement.documents.laterInvoice"),
                  }
            }
          />
          <DocItem
            name={t("portal.procurement.documents.eula")}
            sub={t("portal.procurement.documents.eulaSub")}
            action={{
              label: t("portal.procurement.documents.view"),
              onClick: () => setLegalDoc("eula"),
            }}
          />
          <DocItem
            name={t("portal.procurement.documents.sla")}
            sub={t("portal.procurement.documents.slaSub")}
            action={{
              label: t("portal.procurement.documents.view"),
              onClick: () => setLegalDoc("sla"),
            }}
          />
          <DocItem
            name={t("portal.procurement.documents.subprocessors")}
            sub={t("portal.procurement.documents.subprocessorsSub")}
            action={{
              label: t("portal.procurement.documents.view"),
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
    <li className="portal-docmodal__row">
      <div className="portal-docmodal__text">
        <span className="portal-docmodal__name">{name}</span>
        <span className="portal-docmodal__sub">{sub}</span>
      </div>
      {"unavailable" in action ? (
        <span className="portal-docmodal__later">{action.unavailable}</span>
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
      title={t("portal.procurement.license.title")}
      subtitle={t("portal.procurement.license.subtitle")}
    >
      <LicensePanel
        licenseKey={licenseKey}
        offlineAvailable={offlineAvailable}
        downloadingLicense={downloadingLicense}
        onDownloadOffline={onDownloadOffline}
      />
      {offlineAvailable && trial && (
        <p className="portal-proc__license-hint">
          {t("portal.procurement.license.trialFileHint")}
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
      title={t("portal.procurement.schedule.title")}
      subtitle={t("portal.procurement.schedule.subtitle")}
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
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onConfirm: (deployment: string, seats: number) => void;
}) {
  const { t } = useTranslation();
  const [deployment, setDeployment] = useState<string>("cloud");
  const [seats, setSeats] = useState("");
  const [eula, setEula] = useState(false);
  const [legalDoc, setLegalDoc] = useState<string | null>(null);

  // Reset to defaults each time the dialog opens, so a cancelled setup doesn't linger.
  useEffect(() => {
    if (open) {
      setDeployment("cloud");
      setSeats("");
      setEula(false);
    }
  }, [open]);

  const confirm = () => {
    void recordLegalConsent("eula", "trial"); // clickwrap consent, best-effort
    onConfirm(deployment, Math.max(0, Number(seats) || 0));
  };

  return (
    <>
      <SideModal
        open={open}
        onClose={onClose}
        title={t("portal.procurement.setup.title")}
        subtitle={t("portal.procurement.setup.subtitle")}
        footer={
          <Button
            variant="primary"
            accent="premium"
            loading={busy}
            disabled={!eula}
            onClick={confirm}
          >
            {t("portal.procurement.setup.start")}
          </Button>
        }
      >
        <label className="portal-qb__field">
          <span className="portal-qb__field-label">
            {t("portal.procurement.setup.deployment")}
          </span>
          <div className="portal-qb__opts">
            {DEPLOYMENTS.map((d) => (
              <button
                key={d}
                type="button"
                className="portal-qb__opt"
                data-on={deployment === d || undefined}
                onClick={() => setDeployment(d)}
              >
                <span className="portal-qb__opt-title">
                  {t(`portal.procurement.setup.${d}`)}
                </span>
                <span className="portal-qb__opt-sub">
                  {t(`portal.procurement.setup.${d}Sub`)}
                </span>
              </button>
            ))}
          </div>
        </label>

        <label className="portal-qb__field">
          <span className="portal-qb__field-label">
            {t("portal.procurement.setup.seats")}
          </span>
          <input
            type="number"
            min={0}
            placeholder={t("portal.procurement.setup.seatsPlaceholder")}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
        </label>
        <p className="portal-sidemodal__text">
          {t("portal.procurement.setup.seatsHint")}
        </p>

        <label className="portal-qb__eula">
          <input
            type="checkbox"
            checked={eula}
            onChange={(e) => setEula(e.target.checked)}
          />
          <span>
            {t("portal.procurement.setup.eula")}{" "}
            <button
              type="button"
              className="portal-legal__link"
              onClick={() => setLegalDoc("eula")}
            >
              {t("portal.procurement.setup.viewEula")}
            </button>
          </span>
        </label>
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
      title={t("portal.procurement.trial.title")}
      subtitle={
        ends
          ? t("portal.procurement.trial.subtitle", { date: ends })
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            className="portal-sidemodal__ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {t("portal.procurement.trial.cancel")}
          </button>
          <Button
            variant="primary"
            accent="premium"
            loading={busy}
            disabled={maxed}
            onClick={onExtend}
          >
            {maxed
              ? t("portal.procurement.trial.maxed")
              : t("portal.procurement.trial.extend")}
          </Button>
        </>
      }
    >
      <p className="portal-sidemodal__text">
        {maxed
          ? t("portal.procurement.trial.bodyMaxed")
          : t("portal.procurement.trial.body")}
      </p>
    </SideModal>
  );
}
