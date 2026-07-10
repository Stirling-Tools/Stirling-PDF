import { useEffect } from "react";
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
  nameKey: string;
  subKey: string;
  status: DocStatus;
  fee?: number;
}
// Static demo catalogue for the pilot; the copy lives in the locale under
// portal.procurement.keyDocs and is resolved via t() at render time.
const STAGE_DOCS: { groupKey: string; docs: DocRow[] }[] = [
  {
    groupKey: "portal.procurement.keyDocs.groups.yourDeal",
    docs: [
      {
        nameKey: "portal.procurement.keyDocs.docs.formalQuote.name",
        subKey: "portal.procurement.keyDocs.docs.formalQuote.sub",
        status: "available",
      },
      {
        nameKey: "portal.procurement.keyDocs.docs.msa.name",
        subKey: "portal.procurement.keyDocs.docs.msa.sub",
        status: "action",
      },
      {
        nameKey: "portal.procurement.keyDocs.docs.bankTransfer.name",
        subKey: "portal.procurement.keyDocs.docs.bankTransfer.sub",
        status: "available",
      },
      {
        nameKey: "portal.procurement.keyDocs.docs.purchaseOrder.name",
        subKey: "portal.procurement.keyDocs.docs.purchaseOrder.sub",
        status: "request",
      },
    ],
  },
  {
    groupKey: "portal.procurement.keyDocs.groups.evaluation",
    docs: [
      {
        nameKey: "portal.procurement.keyDocs.docs.soc2.name",
        subKey: "portal.procurement.keyDocs.docs.soc2.sub",
        status: "available",
      },
      {
        nameKey: "portal.procurement.keyDocs.docs.securityReview.name",
        subKey: "portal.procurement.keyDocs.docs.securityReview.sub",
        status: "request",
        fee: 5000,
      },
      {
        nameKey: "portal.procurement.keyDocs.docs.baa.name",
        subKey: "portal.procurement.keyDocs.docs.baa.sub",
        status: "request",
        fee: 2500,
      },
      {
        nameKey: "portal.procurement.keyDocs.docs.w9.name",
        subKey: "portal.procurement.keyDocs.docs.w9.sub",
        status: "available",
      },
      {
        nameKey: "portal.procurement.keyDocs.docs.coi.name",
        subKey: "portal.procurement.keyDocs.docs.coi.sub",
        status: "available",
      },
    ],
  },
];
const STATUS_LABEL: Record<DocStatus, string> = {
  available: "portal.procurement.keyDocs.status.available",
  action: "portal.procurement.keyDocs.status.action",
  request: "portal.procurement.keyDocs.status.request",
};

export function KeyDocumentsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SideModal
      open={open}
      onClose={onClose}
      title={t("portal.procurement.keyDocs.title")}
      subtitle={t("portal.procurement.keyDocs.subtitle")}
    >
      {STAGE_DOCS.map((g) => (
        <div key={g.groupKey} className="portal-docs__group">
          <div className="portal-docs__group-title">{t(g.groupKey)}</div>
          <ul className="portal-docs__list">
            {g.docs.map((d) => (
              <li key={d.nameKey} className="portal-docs__row">
                <div className="portal-docs__row-text">
                  <span className="portal-docs__row-name">{t(d.nameKey)}</span>
                  <span className="portal-docs__row-sub">
                    {t(d.subKey)}
                    {d.fee
                      ? t("portal.procurement.keyDocs.oneTimeFee", {
                          amount: `$${d.fee.toLocaleString()}`,
                        })
                      : ""}
                  </span>
                </div>
                <span
                  className="portal-docs__row-action"
                  data-status={d.status}
                >
                  {t(STATUS_LABEL[d.status])}
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
