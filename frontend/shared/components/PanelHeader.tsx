import type { CSSProperties, ReactNode } from "react";
import { ActionIcon, Menu } from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { IconBadgeAccent } from "@shared/components/IconBadge";
import "@shared/components/PanelHeader.css";

export interface PanelHeaderMenuItem {
  /** Stable key; falls back to the item index. */
  key?: string;
  /** Optional leading glyph. */
  icon?: ReactNode;
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export interface PanelHeaderProps {
  /** Glyph rendered in the tinted circular badge at the header's leading edge. */
  icon: ReactNode;
  /** Header title. */
  title: ReactNode;
  /** Close (X) handler. The trailing close button renders only when supplied. */
  onClose?: () => void;
  /** aria-label for the close button. */
  closeLabel?: string;
  /**
   * When provided, the header becomes a dropdown trigger: a disclosure chevron is
   * shown and clicking it opens a menu of these items (e.g. "Clear chat").
   */
  menuItems?: PanelHeaderMenuItem[];
  /** aria-label for the header when it acts as a menu trigger. */
  menuLabel?: string;
  /**
   * Tints the icon badge with a category colour (blue/purple/green/amber/red).
   * Defaults to the standard blue when omitted (tool + AI chat headers).
   */
  accent?: IconBadgeAccent;
  /** Shows a pulsing status dot on the icon + a tinted border (e.g. AI running). */
  loading?: boolean;
  /** Right-aligned content rendered inside the header bar, after the title
   *  (e.g. a status badge). */
  actions?: ReactNode;
  /** Applied to the inner header element — e.g. to set a view-transition-name. */
  barClassName?: string;
  /** Applied to the outer header container. */
  className?: string;
}

/**
 * The header shared by the rail surfaces — the active tool panel, the AI chat
 * panel, and the Policies detail/wizard. A tinted icon badge + title sit in a
 * rounded bar, with an optional dropdown menu and a trailing close button. The
 * styling stays legible in dark mode (thin border, no heavy fill) across every
 * surface.
 */
export function PanelHeader({
  icon,
  title,
  onClose,
  closeLabel,
  menuItems,
  menuLabel,
  accent,
  loading = false,
  actions,
  barClassName,
  className,
}: PanelHeaderProps) {
  const hasMenu = menuItems != null && menuItems.length > 0;

  // Tint the icon badge with the category colour when an accent is given. Inline
  // so it wins over the default blue treatment in both light and dark mode; the
  // --color-* tokens are theme-aware and match the badge tint used elsewhere.
  const iconStyle: CSSProperties | undefined = accent
    ? {
        color: `var(--color-${accent})`,
        background: `color-mix(in srgb, var(--color-${accent}) 14%, transparent)`,
      }
    : undefined;

  const barClasses = [
    "sui-panelhdr__bar",
    loading ? "sui-panelhdr__bar--loading" : "",
    barClassName ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const barBody = (
    <>
      <span className="sui-panelhdr__icon" style={iconStyle}>
        {icon}
        {loading && <span className="sui-panelhdr__dot" />}
      </span>
      <span className="sui-panelhdr__label">{title}</span>
      {actions != null && (
        <span className="sui-panelhdr__actions">{actions}</span>
      )}
      {hasMenu && (
        <KeyboardArrowDownIcon
          className="sui-panelhdr__chevron"
          sx={{ fontSize: 18 }}
        />
      )}
    </>
  );

  return (
    <div
      className={["sui-panelhdr", className ?? ""].filter(Boolean).join(" ")}
    >
      {hasMenu ? (
        <Menu shadow="md" width={220} position="bottom-start" withinPortal>
          <Menu.Target>
            <button type="button" className={barClasses} aria-label={menuLabel}>
              {barBody}
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            {(menuItems ?? []).map((item, i) => (
              <Menu.Item
                key={item.key ?? i}
                leftSection={item.icon}
                onClick={item.onClick}
                disabled={item.disabled}
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      ) : (
        <div className={barClasses}>{barBody}</div>
      )}

      {onClose && (
        <ActionIcon
          className="sui-panelhdr__close"
          variant="subtle"
          color="gray"
          radius="xl"
          size="md"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </ActionIcon>
      )}
    </div>
  );
}
