import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import "@app/components/shared/quickNav/QuickNavRail.css";

export type QuickNavTarget = "reader" | "editor" | "files" | "processor";

export interface QuickNavEntry {
  id: string;
  label: string;
  icon: ReactNode;
  /**
   * A destination is somewhere you are (aria-current); an action is something
   * engaged inside where you already are (aria-pressed). They read differently
   * to a screen reader even when they sit in the same group.
   */
  kind: "destination" | "action";
  /**
   * What an active destination is current *for*. A whole app ("app") and a place
   * inside it ("page", the default) can both be active at once - in My Files the
   * editor tile and the Files entry are both lit - and marking both as the
   * current page makes a screen reader announce two current pages in one nav.
   */
  currentKind?: "app" | "page";
  isActive?: boolean;
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
  kind,
  currentKind = "page",
  isActive,
  disabled,
  reason,
  badge,
  badgeTone = "danger",
  onClick,
}: Omit<QuickNavEntry, "id">) {
  return (
    <Tooltip
      label={disabled && reason ? `${label} — ${reason}` : label}
      position="right"
      withinPortal
      // Touch included: above the mobile breakpoint the rail renders on tablets,
      // where hover never fires and the tooltip is the only label these icons have.
      events={{ hover: true, focus: true, touch: true }}
    >
      <button
        type="button"
        className="quick-nav-rail-item"
        data-current={isActive || undefined}
        aria-current={
          kind === "destination" && isActive
            ? currentKind === "app"
              ? "true"
              : "page"
            : undefined
        }
        aria-pressed={kind === "action" ? Boolean(isActive) : undefined}
        aria-label={label}
        // aria-disabled, not `disabled`: a disabled button drops out of the tab
        // order, taking its tooltip - and therefore the reason it's unavailable -
        // with it.
        aria-disabled={disabled || undefined}
        // An active entry stays clickable: the app you're in is marked current in
        // the first group, and clicking it is how you get back to that app's
        // default view from a sub-destination like My Files.
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
 * the current one is indicated and unavailable ones are disabled with a reason,
 * but slots never appear or vanish, so position stays meaningful.
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
