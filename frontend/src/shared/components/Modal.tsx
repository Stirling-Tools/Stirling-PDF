import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "@shared/components/Modal.css";

export type ModalWidth = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional heading slot rendered above the body. */
  title?: ReactNode;
  /** Optional sub-heading rendered under the title. */
  subtitle?: ReactNode;
  /** Optional footer slot rendered below the body. */
  footer?: ReactNode;
  /** Width preset. sm=24rem, md=32rem, lg=48rem, xl=64rem. Defaults to md. */
  width?: ModalWidth;
  /** Disable click-on-backdrop dismissal. Defaults to false. */
  disableBackdropClose?: boolean;
  /** Disable Escape-key dismissal. Defaults to false. */
  disableEscapeClose?: boolean;
  /** Accessible name when no visible `title` is provided. */
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Portal-rendered modal. Backdrop fades in, dialog scales in. ESC and
 * click-on-backdrop close by default. Each instance is self-contained — the
 * caller owns the open state and the close handler.
 *
 * Focus is trapped inside the dialog while open and returned to the
 * previously-focused element on close.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  width = "md",
  disableBackdropClose = false,
  disableEscapeClose = false,
  ariaLabel,
  className,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open || disableEscapeClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, disableEscapeClose, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || !dialog) return;
      const focusables =
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  function onBackdropClick() {
    if (!disableBackdropClose) onClose();
  }

  const hasTitle = title !== undefined && title !== null;

  return createPortal(
    <div
      className="sui-modal__backdrop"
      onClick={onBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={[
          "sui-modal",
          `sui-modal--${width}`,
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-label={!hasTitle ? ariaLabel : undefined}
      >
        {(title || subtitle) && (
          <header className="sui-modal__header">
            <div className="sui-modal__header-text">
              {title && (
                <div id={titleId} className="sui-modal__title">
                  {title}
                </div>
              )}
              {subtitle && <div className="sui-modal__sub">{subtitle}</div>}
            </div>
            <button
              type="button"
              className="sui-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
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
            </button>
          </header>
        )}
        <div className="sui-modal__body">{children}</div>
        {footer && <footer className="sui-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
