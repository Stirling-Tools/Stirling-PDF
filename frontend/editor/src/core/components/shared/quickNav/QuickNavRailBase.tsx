import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import "@app/components/shared/quickNav/QuickNavRail.css";

export type QuickNavTarget = "reader" | "editor" | "files" | "processor";

export interface QuickNavEntry {
  id: string;
  label: string;
  icon: ReactNode;
  /** The app you are in, drawn with an edge bar. */
  current?: boolean;
  /** Only for entries that toggle something; use `current` for the app you are in. */
  pressed?: boolean;
  /** Inert, with `reason` as its tooltip. Entries are dimmed, never dropped. */
  disabled?: boolean;
  reason?: string;
  badge?: number;
  /** Popup semantics for an entry whose panel is rendered in another tree. */
  expanded?: boolean;
  controls?: string;
  /** "danger" waits on the user; "warning" is awareness only. */
  badgeTone?: "danger" | "warning";
  onClick: () => void;
}

export interface QuickNavRailBaseProps {
  /** Divided by a rule; empty groups are dropped. */
  groups: QuickNavEntry[][];
  footer?: ReactNode;
}

/** Exported so footer entries reuse it rather than a lookalike. */
export function RailButton({
  label,
  icon,
  pressed,
  disabled,
  reason,
  badge,
  badgeTone = "danger",
  current,
  expanded,
  controls,
  onClick,
}: Omit<QuickNavEntry, "id">) {
  return (
    <Tooltip
      content={disabled && reason ? `${label} — ${reason}` : label}
      position="right"
      arrow
    >
      <button
        type="button"
        className="quick-nav-rail-item"
        aria-pressed={pressed}
        aria-current={current ? "true" : undefined}
        aria-label={label}
        aria-haspopup={expanded === undefined ? undefined : "dialog"}
        aria-expanded={expanded}
        aria-controls={expanded === undefined ? undefined : controls}
        // aria-disabled, not `disabled`: stays focusable, so its tooltip is reachable.
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
      >
        {icon}
        {badge !== undefined && badge > 0 && (
          <span
            className="quick-nav-rail-badge"
            data-tone={badgeTone}
            aria-hidden="true"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

export function QuickNavRailBase({ groups, footer }: QuickNavRailBaseProps) {
  const { t } = useTranslation();
  const populated = groups.filter((entries) => entries.length > 0);
  return (
    <nav
      className="quick-nav-rail"
      aria-label={t("quickNav.landmark", "Quick navigation")}
    >
      {populated.map((group, index) => (
        <div className="quick-nav-rail-group" key={group[0].id}>
          {index > 0 && <hr className="quick-nav-rail-divider" />}
          {group.map((entry) => (
            <RailButton key={entry.id} {...entry} />
          ))}
        </div>
      ))}
      {footer}
    </nav>
  );
}
