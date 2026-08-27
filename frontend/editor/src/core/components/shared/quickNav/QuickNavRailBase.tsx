import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import "@app/components/shared/quickNav/QuickNavRail.css";

export type QuickNavTarget = "reader" | "editor" | "files" | "processor";

export interface QuickNavEntry {
  id: string;
  label: string;
  icon: ReactNode;
  /**
   * Set only for a genuine on/off toggle, and then it carries that state. Left
   * undefined by everything that simply opens something: nothing in this bar is
   * a view you sit in, so there is no "current" entry to indicate - the one place
   * that idea applies is the app switcher above, which shows it by which slot a
   * mark occupies rather than by highlighting.
   */
  pressed?: boolean;
  /**
   * Rendered but not operable, with `reason` as the tooltip. Preferred over
   * omitting the entry: the rail's slots must not appear or disappear as
   * permissions and endpoint availability resolve, and a disabled icon with an
   * explanation teaches more than a missing one.
   */
  disabled?: boolean;
  reason?: string;
  /** Count shown on the icon. Zero/undefined renders nothing. */
  badge?: number;
  /**
   * Severity of the badge: "danger" for something waiting on the user, "warning"
   * for something they only need to be aware of.
   */
  badgeTone?: "danger" | "warning";
  onClick: () => void;
}

export interface QuickNavRailBaseProps {
  /**
   * Groups of entries, rendered in order with a divider between each. The first
   * group is the app switcher; later groups hold destinations and actions within
   * the app you are in.
   *
   * The switcher holds only the apps you are NOT in - the one you are in is the
   * brand mark above the bar - so it is empty, and dropped, in builds with
   * nowhere else to go.
   */
  groups: QuickNavEntry[][];
  /** Pinned to the bottom of the bar (the account control). */
  footer?: ReactNode;
}

/**
 * One icon in the bar. Exported so the footer's own entries (the teams link)
 * are the same control as the navigation groups above them, rather than a
 * lookalike that drifts on hover, focus and disabled styling.
 */
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
        // Only a real toggle reports a state; the rest are not places you can be
        // in, so they have none to report.
        aria-pressed={pressed}
        aria-label={label}
        // aria-disabled, not `disabled`: a disabled button drops out of the tab
        // order, taking its tooltip - and therefore the reason it's unavailable -
        // with it.
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
 * Skinny always-icon bar for moving around the product. One solid bar; groups
 * inside it are divided by a rule.
 *
 * Every entry stays rendered wherever you are and whatever your permissions:
 * unavailable ones are disabled with a reason, but slots never appear or vanish,
 * so position stays meaningful. Nothing here is highlighted as current - these
 * open things, they are not views you occupy.
 */
export function QuickNavRailBase({ groups, footer }: QuickNavRailBaseProps) {
  const { t } = useTranslation();
  // The switcher is groups[0] by contract; tagging it here rather than by
  // rendered position means the tag survives it being dropped when empty, so the
  // group below can't inherit its swap animation.
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
