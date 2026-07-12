import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import CloseRounded from "@mui/icons-material/CloseRounded";
import "@portal/views/Procurement.css";

/** Keep keyboard focus inside an open dialog: focus it on open and wrap Tab at the edges. */
export function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    if (!panel) return;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
    (focusables()[0] ?? panel).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", onKey);
    return () => {
      panel.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);
  return ref;
}

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
      className="portal-procmodal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={trapRef}
        className="portal-procmodal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
