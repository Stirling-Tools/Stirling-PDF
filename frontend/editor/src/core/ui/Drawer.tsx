import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FocusTrap } from "@mantine/core";
import { Button } from "@app/ui/Button";
import "@app/ui/Drawer.css";

export type DrawerSide = "right" | "left";
export type DrawerWidth = "sm" | "md" | "lg";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  /** sm=22rem, md=27.5rem, lg=36rem. */
  width?: DrawerWidth;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  disableBackdropClose?: boolean;
  disableEscapeClose?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
}

/** Tab focus trapping and restoration are delegated to Mantine's FocusTrap. */
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
    <>
      <div
        className="sui-drawer__backdrop"
        onClick={onBackdropClick}
        role="presentation"
      />
      <FocusTrap active>
        <aside
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
          tabIndex={-1}
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
              <Button
                variant="tertiary"
                accent="neutral"
                size="sm"
                shape="circle"
                className="sui-drawer__close"
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
          <div className="sui-drawer__body">{children}</div>
          {footer && <footer className="sui-drawer__footer">{footer}</footer>}
        </aside>
      </FocusTrap>
    </>,
    document.body,
  );
}
