import type { ReactNode } from "react";
import { ActionIcon } from "@app/ui/ActionIcon";
import "@app/ui/Banner.css";

export type BannerTone = "info" | "success" | "warning" | "danger" | "neutral";

export interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  /** Caller-supplied icon keeps this component icon-set-agnostic. */
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Inline alert. Use Toast for transient overlay notifications instead. */
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
        <ActionIcon
          variant="tertiary"
          accent="neutral"
          size="sm"
          shape="circle"
          className="sui-banner__close"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <span aria-hidden>×</span>
        </ActionIcon>
      )}
    </div>
  );
}
