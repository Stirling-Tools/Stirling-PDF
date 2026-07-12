import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { Button } from "@app/ui";
import type { ProcurementSnapshot } from "@portal/api/procurement";
import { CalendlyInline } from "@portal/components/procurement/CalendlyInline";
import { LicensePanel } from "@portal/components/procurement/ProcurementStages";
import { useFocusTrap } from "@portal/components/procurement/ProcurementModal";
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
          <CloseRounded style={{ fontSize: "1.2rem" }} />
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

  // Reset to defaults each time the dialog opens, so a cancelled setup doesn't linger.
  useEffect(() => {
    if (open) {
      setDeployment("cloud");
      setSeats("");
    }
  }, [open]);

  return (
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
          onClick={() => onConfirm(deployment, Math.max(0, Number(seats) || 0))}
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
    </SideModal>
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
