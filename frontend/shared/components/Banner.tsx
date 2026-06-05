import type { ReactNode } from "react";
import "@shared/components/Banner.css";

export type BannerTone = "info" | "success" | "warning" | "danger" | "neutral";

export interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned action — typically a button. */
  action?: ReactNode;
  /** When set, shows an × button that calls this handler. */
  onDismiss?: () => void;
  /** Optional leading icon (caller supplies — keeps the primitive icon-set-agnostic). */
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Inline alert. Use `tone` to convey severity; pair with `action` for
 * "Approaching cap → Upgrade" style flows. Use `Toast` (separate primitive)
 * for transient/dismissible notifications layered over the UI.
 */
export function Banner({
  tone = "info",
  title,
  description,
  action,
  onDismiss,
  icon,
  className,
  children,
}: BannerProps) {
  return (
    <div
      role="status"
      className={["sui-banner", `sui-banner--${tone}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {icon && (
        <div className="sui-banner__icon" aria-hidden>
          {icon}
        </div>
      )}
      <div className="sui-banner__body">
        {title && <div className="sui-banner__title">{title}</div>}
        {description && <div className="sui-banner__desc">{description}</div>}
        {children}
      </div>
      {action && <div className="sui-banner__action">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          className="sui-banner__close"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
