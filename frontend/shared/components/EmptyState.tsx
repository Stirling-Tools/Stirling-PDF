import type { ReactNode } from "react";
import "@shared/components/EmptyState.css";

export interface EmptyStateProps {
  /** Eyebrow text shown above the title (e.g. "No pipelines yet"). */
  eyebrow?: ReactNode;
  /** Headline. */
  title: ReactNode;
  /** One- or two-line body copy. */
  description?: ReactNode;
  /** Optional visual at the top (icon, illustration, etc). */
  icon?: ReactNode;
  /** Primary + secondary CTAs. */
  actions?: ReactNode;
  /** Visual size. `compact` removes the icon row's padding for inline use. */
  size?: "compact" | "default";
  className?: string;
}

/**
 * Centered "nothing here yet" panel. Replaces the bespoke empty cards inline
 * in Pipelines (free tier), NotificationsDropdown (all caught up), and the
 * search modal (no matches).
 */
export function EmptyState({
  eyebrow,
  title,
  description,
  icon,
  actions,
  size = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={["sui-empty", `sui-empty--${size}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {icon && (
        <div className="sui-empty__icon" aria-hidden>
          {icon}
        </div>
      )}
      {eyebrow && <div className="sui-empty__eyebrow">{eyebrow}</div>}
      <h2 className="sui-empty__title">{title}</h2>
      {description && <p className="sui-empty__copy">{description}</p>}
      {actions && <div className="sui-empty__actions">{actions}</div>}
    </div>
  );
}
