import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@shared/components";
import type { ProcurementSnapshot } from "@portal/api/procurement";
import { useFocusTrap } from "@portal/components/procurement/ProcurementModal";
import "@portal/views/Procurement.css";

/**
 * Small centred dialogs that hang off the deal-status hero's quick actions — Key documents, Schedule
 * a call, and trial management. Content is mocked for the pilot (static demo data); the shells and
 * wiring are real so the hero behaves like the marketing prototype.
 */

function SideModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
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
        className="portal-sidemodal__panel"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <button
          type="button"
          className="portal-procmodal__close"
          onClick={onClose}
          aria-label="Close"
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
      { name: "Formal quote", sub: "Built to your volume, term, and service level", status: "available" },
      { name: "Master Services Agreement", sub: "One signature — MSA, order form, EULA, and DPA combined", status: "action" },
      { name: "Bank transfer instructions", sub: "Wire details for your AP team", status: "available" },
      { name: "Purchase order", sub: "Issuing a PO? Upload it and we invoice against it", status: "request" },
    ],
  },
  {
    group: "Supporting your evaluation",
    docs: [
      { name: "SOC 2 Type II report", sub: "Audited · NDA-gated", status: "available" },
      { name: "Custom security review", sub: "We complete your questionnaire and join your review call", status: "request", fee: 5000 },
      { name: "Business Associate Agreement", sub: "HIPAA · available on request", status: "request", fee: 2500 },
      { name: "IRS Form W-9", sub: "Stirling PDF Inc.", status: "available" },
      { name: "Certificate of Insurance", sub: "Cyber + E&O · current policy", status: "available" },
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
const SLOTS = [
  "Tomorrow · 10:00",
  "Tomorrow · 15:30",
  "Thursday · 11:00",
  "Friday · 09:30",
];

export function ScheduleCallModal({
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
      title="Schedule a call"
      subtitle="Your solutions engineer will walk your team through the rollout."
    >
      <div className="portal-se">
        <span className="portal-se__avatar" aria-hidden>
          SE
        </span>
        <div>
          <div className="portal-se__name">Your solutions engineer</div>
          <div className="portal-se__role">
            Dedicated to your evaluation and rollout
          </div>
        </div>
      </div>
      <div className="portal-slots">
        {SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            className="portal-slots__slot"
            onClick={onClose}
          >
            {s}
          </button>
        ))}
      </div>
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
      title="Enterprise trial"
      subtitle={ends ? `Your free trial runs through ${ends}. No card required.` : undefined}
      footer={
        <>
          <button
            type="button"
            className="portal-sidemodal__ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel trial
          </button>
          <Button
            variant="gradient"
            accent="purple"
            loading={busy}
            disabled={maxed}
            onClick={onExtend}
          >
            {maxed ? "Maxed out" : "Extend 7 days"}
          </Button>
        </>
      }
    >
      <p className="portal-sidemodal__text">
        {maxed
          ? "You have used all your extensions — talk to your solutions engineer if you need more time."
          : "Extending adds 7 days and notifies your solutions engineer."}
      </p>
    </SideModal>
  );
}
