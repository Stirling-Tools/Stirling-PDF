import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import "@portal/components/shared/FlowModal.css";

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
 * The one dialog shell for the portal's flows — procurement's takeover, the trial/licence/schedule
 * dialogs, the legal reader.
 *
 * Every one of these used to hand-roll the same thing (portal to body, dimmed backdrop, focus trap,
 * Escape and backdrop-click to close, a close button, header/body/footer bands) with slightly
 * different padding and close treatment, which is why sibling dialogs looked subtly unalike. Sharing
 * the header alone was not enough: the shell is most of what makes a dialog look like itself.
 *
 * Header and footer are slots rather than props so a flow can put its own stepped header (see
 * StepModalHeader) in the band without this shell knowing anything about steps.
 */
export function FlowModal({
  open,
  onClose,
  label,
  header,
  footer,
  size = "md",
  hideClose = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog; the visible heading lives in `header`. */
  label: string;
  header?: ReactNode;
  footer?: ReactNode;
  /** `md` for the task dialogs, `lg` for the procurement takeover. */
  size?: "md" | "lg";
  /**
   * Let the content own the close, for a step whose own header already carries it beside a step
   * badge. Escape and the backdrop still close, so the dialog is never inescapable.
   */
  hideClose?: boolean;
  children: ReactNode;
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
      className="portal-flowmodal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={trapRef}
        className="portal-flowmodal__panel"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {/* The band carries the heading and the close together on one row. It is skipped entirely
            when the content owns both — a step with its own stepped header puts the close beside its
            step badge — rather than leaving a band that holds nothing but a stray close. */}
        {(header || !hideClose) && (
          <div
            className="portal-flowmodal__header"
            data-bare={!header || undefined}
          >
            <div className="portal-flowmodal__header-slot">{header}</div>
            {!hideClose && (
              <Button
                variant="tertiary"
                accent="neutral"
                size="sm"
                shape="circle"
                onClick={onClose}
                aria-label={t("portal.procurement.modal.close")}
                leftSection={
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                }
              />
            )}
          </div>
        )}
        <div className="portal-flowmodal__body">{children}</div>
        {footer && <div className="portal-flowmodal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
