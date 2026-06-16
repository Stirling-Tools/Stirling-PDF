import type { ReactNode } from "react";
import "@shared/components/PanelHeader.css";

export interface PanelHeaderProps {
  title: ReactNode;
  /** Sub-heading below the title. */
  subtitle?: ReactNode;
  /** Show a back chevron and trigger this callback when clicked. */
  onBack?: () => void;
  /** Right-aligned action buttons / chips. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Header strip used by drill-down panels (admin tabs, agent detail, settings
 * sub-pages). Back chevron renders only when `onBack` is supplied.
 */
export function PanelHeader({
  title,
  subtitle,
  onBack,
  actions,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={["sui-panelhdr", className ?? ""].filter(Boolean).join(" ")}
    >
      <div className="sui-panelhdr__left">
        {onBack && (
          <button
            type="button"
            className="sui-panelhdr__back"
            onClick={onBack}
            aria-label="Back"
          >
            <svg
              viewBox="0 0 24 24"
              width={18}
              height={18}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <div className="sui-panelhdr__text">
          <div className="sui-panelhdr__title">{title}</div>
          {subtitle && <div className="sui-panelhdr__sub">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="sui-panelhdr__actions">{actions}</div>}
    </div>
  );
}
