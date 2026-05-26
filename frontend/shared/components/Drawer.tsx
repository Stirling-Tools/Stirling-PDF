import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "@shared/components/Drawer.css";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DrawerSide = "right" | "left";
export type DrawerWidth = "sm" | "md" | "lg";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  /** Width preset. sm=22rem, md=27.5rem, lg=36rem. */
  width?: DrawerWidth;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Sticky footer slot below the body. */
  footer?: ReactNode;
  disableBackdropClose?: boolean;
  disableEscapeClose?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
}

/**
 * Side drawer — sibling to {@link Modal}. Slides in from `side`, locks body
 * scroll, closes on backdrop click or Escape. PipelineDetailDrawer, doc
 * detail drawers, etc. should all sit on top of this primitive.
 */
export function Drawer({
  open,
  onClose,
  side = "right",
  width = "md",
  title,
  subtitle,
  footer,
  disableBackdropClose = false,
  disableEscapeClose = false,
  className,
  ariaLabel,
  children,
}: DrawerProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
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
    <>
      <div
        className="sui-drawer__backdrop"
        onClick={onBackdropClick}
        role="presentation"
      />
      <aside
        ref={dialogRef}
        className={[
          "sui-drawer",
          `sui-drawer--${side}`,
          `sui-drawer--${width}`,
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-label={!hasTitle ? ariaLabel : undefined}
      >
        {(title || subtitle) && (
          <header className="sui-drawer__header">
            <div className="sui-drawer__header-text">
              {title && (
                <div id={titleId} className="sui-drawer__title">
                  {title}
                </div>
              )}
              {subtitle && <div className="sui-drawer__sub">{subtitle}</div>}
            </div>
            <button
              type="button"
              className="sui-drawer__close"
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
        <div className="sui-drawer__body">{children}</div>
        {footer && <footer className="sui-drawer__footer">{footer}</footer>}
      </aside>
    </>,
    document.body,
  );
}
