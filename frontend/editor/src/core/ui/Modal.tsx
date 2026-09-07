import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FocusTrap } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useIsOverflowing } from "@app/hooks/useIsOverflowing";
import "@app/ui/Modal.css";

export type ModalWidth = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  /** When set, a back arrow renders at the start of the header (e.g. to step back in a staged modal). */
  onBack?: () => void;
  /** Accessible label for the back arrow. */
  backLabel?: string;
  /** sm=24rem, md=32rem, lg=48rem, xl=64rem. */
  width?: ModalWidth;
  disableBackdropClose?: boolean;
  disableEscapeClose?: boolean;
  /** Accessible name when no visible title is provided. */
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}

/** Tab focus trapping and restoration are delegated to Mantine's FocusTrap. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  onBack,
  backLabel,
  width = "md",
  disableBackdropClose = false,
  disableEscapeClose = false,
  ariaLabel,
  className,
  children,
}: ModalProps) {
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  // A body that overflows must be reachable by keyboard to scroll; only its non-focusable
  // content (header close + footer live outside it). tabindex lands only when it scrolls, so
  // fitting modals gain no stray tab stop (axe scrollable-region-focusable).
  const bodyScrolls = useIsOverflowing(bodyRef);

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
          {(title || subtitle || onBack) && (
            <header className="sui-modal__header">
              {onBack && (
                <Button
                  variant="tertiary"
                  accent="neutral"
                  size="sm"
                  shape="circle"
                  className="sui-modal__back"
                  onClick={onBack}
                  aria-label={backLabel ?? "Back"}
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
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                  }
                />
              )}
              <div className="sui-modal__header-text">
                {title && (
                  <div id={titleId} className="sui-modal__title">
                    {title}
                  </div>
                )}
                {subtitle && <div className="sui-modal__sub">{subtitle}</div>}
              </div>
              <Button
                variant="tertiary"
                accent="neutral"
                size="sm"
                shape="circle"
                className="sui-modal__close"
                onClick={onClose}
                aria-label="Close"
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
            </header>
          )}
          <div
            ref={bodyRef}
            className="sui-modal__body"
            tabIndex={bodyScrolls ? 0 : undefined}
          >
            {children}
          </div>
          {footer && <footer className="sui-modal__footer">{footer}</footer>}
        </div>
      </FocusTrap>
    </div>,
    document.body,
  );
}
