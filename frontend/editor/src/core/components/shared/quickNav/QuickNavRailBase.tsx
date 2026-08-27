import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import "@app/components/shared/quickNav/QuickNavRail.css";

export type QuickNavTarget = "reader" | "editor" | "files" | "processor";

export interface QuickNavEntry {
  id: string;
  label: string;
  icon: ReactNode;
  /** Only for a real toggle: nothing here is a view you occupy. */
  pressed?: boolean;
  /** Inert, with `reason` as the tooltip. Slots must not vanish as permissions resolve. */
  disabled?: boolean;
  reason?: string;
  badge?: number;
  /**
   * Set when the entry opens a panel: presence adds the popup semantics, the value
   * says whether it is open. The panel it names is rendered in another tree, so
   * `controls` is the only link between the two.
   */
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

/** Exported so the footer's entries are this control, not a lookalike. */
export function RailButton({
  label,
  icon,
  pressed,
  disabled,
  reason,
  badge,
  badgeTone = "danger",
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
        aria-label={label}
        aria-haspopup={expanded === undefined ? undefined : "dialog"}
        aria-expanded={expanded}
        aria-controls={expanded === undefined ? undefined : controls}
        // aria-disabled, not `disabled`: keeps it focusable, so the tooltip
        // explaining why stays reachable.
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

/** Unavailable entries are disabled with a reason, never dropped. */
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
