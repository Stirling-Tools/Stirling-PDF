import type { ReactNode } from "react";
import "@shared/components/PanelHeader.css";
import { Button } from "@shared/components/Button";
import { IconBadge } from "@shared/components/IconBadge";

export interface PanelHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  /** Leading glyph shown in a tinted IconBadge. */
  icon?: ReactNode;
  /** Tint for the leading icon box. Defaults to blue. */
  iconAccent?: "blue" | "purple" | "green" | "amber" | "red";
  actions?: ReactNode;
  className?: string;
}

export function PanelHeader({
  title,
  subtitle,
  onBack,
  icon,
  iconAccent = "blue",
  actions,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={["sui-panelhdr", className ?? ""].filter(Boolean).join(" ")}
    >
      <div className="sui-panelhdr__left">
        {onBack && (
          <Button
            variant="ghost"
            shape="circle"
            className="sui-panelhdr__back"
            onClick={onBack}
            aria-label="Back"
            leftSection={
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
            }
          />
        )}
        {icon && (
          <IconBadge accent={iconAccent} size="md">
            {icon}
          </IconBadge>
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
