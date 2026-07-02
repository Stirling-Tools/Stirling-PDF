import { useEffect } from "react";
import { createPortal } from "react-dom";
import "@portal/views/Procurement.css";

/**
 * Full-screen takeover modal for the procurement flow, copying the prototype's modal design
 * (portaled to body, dimmed + blurred backdrop, rounded panel, close button). The Home deal-status
 * hero expands into this.
 */
export function ProcurementModal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="portal-procmodal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="portal-procmodal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          type="button"
          className="portal-procmodal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        <div className="portal-procmodal__header">
          <h2 className="portal-procmodal__title">{title}</h2>
          {subtitle && <p className="portal-procmodal__sub">{subtitle}</p>}
        </div>
        <div className="portal-procmodal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
