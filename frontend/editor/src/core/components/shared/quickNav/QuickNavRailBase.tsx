import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import "@app/components/shared/quickNav/QuickNavRail.css";

export type QuickNavTarget = "reader" | "editor" | "files" | "processor";

export interface QuickNavEntry {
  id: string;
  label: string;
  icon: ReactNode;
  /** Only for a real toggle. Nothing here is a view you occupy, so nothing is "current". */
  pressed?: boolean;
  /**
   * Rendered but inert, with `reason` as the tooltip. Slots must not appear and
   * vanish as permissions resolve, so position stays meaningful.
   */
  disabled?: boolean;
  reason?: string;
  /** Count shown on the icon. Zero/undefined renders nothing. */
  badge?: number;
  /** "danger" waits on the user; "warning" is awareness only. */
  badgeTone?: "danger" | "warning";
  onClick: () => void;
}

export interface QuickNavRailBaseProps {
  /** Rendered in order, divided by a rule. Empty groups are dropped. */
  groups: QuickNavEntry[][];
  /** Pinned to the bottom of the bar (the account control). */
  footer?: ReactNode;
}

/** One icon. Exported so the footer's entries are this control, not a lookalike. */
export function RailButton({
  label,
  icon,
  pressed,
  disabled,
  reason,
  badge,
  badgeTone = "danger",
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

/**
 * Always-icon bar for moving around the product. Entries stay rendered whatever
 * your permissions - unavailable ones are disabled with a reason, never dropped.
 */
export function QuickNavRailBase({ groups, footer }: QuickNavRailBaseProps) {
  const { t } = useTranslation();
  // Tagged by index, not rendered position, so dropping an empty group can't hand
  // the tag to the one below it.
  const populated = groups
    .map((entries, index) => ({ entries, isSwitcher: index === 0 }))
    .filter((group) => group.entries.length > 0);
  return (
    <nav
      className="quick-nav-rail"
      aria-label={t("quickNav.landmark", "Quick navigation")}
    >
      {populated.map((group, index) => (
        <div
          className="quick-nav-rail-group"
          data-switcher={group.isSwitcher || undefined}
          key={group.entries[0].id}
        >
          {index > 0 && <hr className="quick-nav-rail-divider" />}
          {group.entries.map((entry) => (
            <RailButton key={entry.id} {...entry} />
          ))}
        </div>
      ))}
      {footer}
    </nav>
  );
}
