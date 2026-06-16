import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FocusTrap } from "@mantine/core";
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

/**
 * Portal-rendered modal with our own brand shell (header / body / footer,
 * width presets, backdrop). The hard part — trapping Tab focus inside the
 * dialog, initial focus, and restoring focus to the opener on close — is
 * delegated to Mantine's <FocusTrap> rather than hand-rolled. ESC and
 * backdrop click close by default; the caller owns the open state.
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
      <FocusTrap active>
        <div
          className={["sui-modal", `sui-modal--${width}`, className ?? ""]
            .filter(Boolean)
            .join(" ")}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={hasTitle ? titleId : undefined}
          aria-label={!hasTitle ? ariaLabel : undefined}
          tabIndex={-1}
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
      </FocusTrap>
    </div>,
    document.body,
  );
}
