import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import type { ProcurementSnapshot } from "@portal/api/procurement";
import { CalendlyInline } from "@portal/components/procurement/CalendlyInline";
import { useFocusTrap } from "@portal/components/procurement/ProcurementModal";
import "@portal/views/Procurement.css";

/**
 * Small centred dialogs that hang off the deal-status hero's quick actions — Key documents, Schedule
 * a call, and trial management. Schedule a call embeds the live Calendly scheduler; Key documents is
 * still mocked for the pilot (static demo data). The shells and wiring are real so the hero behaves
 * like the marketing prototype.
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

// ── Key documents ────────────────────────────────────────────────────────────
type DocStatus = "available" | "action" | "request";
interface DocRow {
  name: string;
  sub: string;
  status: DocStatus;
  fee?: number;
}
const STAGE_DOCS: { group: string; docs: DocRow[] }[] = [
  {
    group: "Your deal",
    docs: [
      {
        name: "Formal quote",
        sub: "Built to your volume, term, and service level",
        status: "available",
      },
      {
        name: "Master Services Agreement",
        sub: "One signature — MSA, order form, EULA, and DPA combined",
        status: "action",
      },
      {
        name: "Bank transfer instructions",
        sub: "Wire details for your AP team",
        status: "available",
      },
      {
        name: "Purchase order",
        sub: "Issuing a PO? Upload it and we invoice against it",
        status: "request",
      },
    ],
  },
  {
    group: "Supporting your evaluation",
    docs: [
      {
        name: "SOC 2 Type II report",
        sub: "Audited · NDA-gated",
        status: "available",
      },
      {
        name: "Custom security review",
        sub: "We complete your questionnaire and join your review call",
        status: "request",
        fee: 5000,
      },
      {
        name: "Business Associate Agreement",
        sub: "HIPAA · available on request",
        status: "request",
        fee: 2500,
      },
      { name: "IRS Form W-9", sub: "Stirling PDF Inc.", status: "available" },
      {
        name: "Certificate of Insurance",
        sub: "Cyber + E&O · current policy",
        status: "available",
      },
    ],
  },
];
const STATUS_LABEL: Record<DocStatus, string> = {
  available: "Download",
  action: "Action needed",
  request: "Request",
};

export function KeyDocumentsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <SideModal
      open={open}
      onClose={onClose}
      title="Key documents"
      subtitle="Everything for each stage of your rollout, in one place."
    >
      {STAGE_DOCS.map((g) => (
        <div key={g.group} className="portal-docs__group">
          <div className="portal-docs__group-title">{g.group}</div>
          <ul className="portal-docs__list">
            {g.docs.map((d) => (
              <li key={d.name} className="portal-docs__row">
                <div className="portal-docs__row-text">
                  <span className="portal-docs__row-name">{d.name}</span>
                  <span className="portal-docs__row-sub">
                    {d.sub}
                    {d.fee ? ` · one-time $${d.fee.toLocaleString()}` : ""}
                  </span>
                </div>
                <span
                  className="portal-docs__row-action"
                  data-status={d.status}
                >
                  {STATUS_LABEL[d.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
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
