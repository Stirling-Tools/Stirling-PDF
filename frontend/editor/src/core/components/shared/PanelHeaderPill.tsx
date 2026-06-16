import type { ReactNode } from "react";
import { ActionIcon, Menu } from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import "@app/components/shared/PanelHeaderPill.css";

export interface PanelHeaderPillMenuItem {
  /** Stable key; falls back to the item index. */
  key?: string;
  /** Optional leading glyph. */
  icon?: ReactNode;
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export interface PanelHeaderPillProps {
  /** Glyph rendered in the tinted circular badge at the pill's leading edge. */
  icon: ReactNode;
  /** Pill label. */
  title: ReactNode;
  /** Close (X) handler. The trailing close button renders only when supplied. */
  onClose?: () => void;
  /** aria-label for the close button. */
  closeLabel?: string;
  /**
   * When provided, the pill becomes a dropdown trigger: a disclosure chevron is
   * shown and clicking the pill opens a menu of these items (e.g. "Clear chat").
   */
  menuItems?: PanelHeaderPillMenuItem[];
  /** aria-label for the pill when it acts as a menu trigger. */
  menuLabel?: string;
  /** Shows a pulsing status dot on the icon + a tinted border (e.g. AI running). */
  loading?: boolean;
  /** Right-aligned content rendered before the close button (e.g. a status badge). */
  actions?: ReactNode;
  /** Applied to the pill element itself — e.g. to set a view-transition-name. */
  pillClassName?: string;
  /** Applied to the outer header container. */
  className?: string;
}

/**
 * The rounded "pill" header shared by the rail surfaces — the active tool panel,
 * the AI chat panel, and the Policies detail/wizard. A tinted icon badge + title
 * sit in a pill, with an optional dropdown menu and a trailing close button. The
 * pill styling mirrors the AI chat header so it stays legible in dark mode (thin
 * border, no heavy fill) across every surface.
 */
export function PanelHeaderPill({
  icon,
  title,
  onClose,
  closeLabel,
  menuItems,
  menuLabel,
  loading = false,
  actions,
  pillClassName,
  className,
}: PanelHeaderPillProps) {
  const hasMenu = menuItems != null && menuItems.length > 0;

  const pillClasses = [
    "sui-pillhdr__pill",
    loading ? "sui-pillhdr__pill--loading" : "",
    pillClassName ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const pillBody = (
    <>
      <span className="sui-pillhdr__icon">
        {icon}
        {loading && <span className="sui-pillhdr__dot" />}
      </span>
      <span className="sui-pillhdr__label">{title}</span>
      {hasMenu && (
        <KeyboardArrowDownIcon
          className="sui-pillhdr__chevron"
          sx={{ fontSize: 18 }}
        />
      )}
    </>
  );

  return (
    <div className={["sui-pillhdr", className ?? ""].filter(Boolean).join(" ")}>
      {hasMenu ? (
        <Menu shadow="md" width={220} position="bottom-start" withinPortal>
          <Menu.Target>
            <button
              type="button"
              className={pillClasses}
              aria-label={menuLabel}
            >
              {pillBody}
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
        <div className={pillClasses}>{pillBody}</div>
      )}

      {(actions != null || onClose != null) && (
        <div className="sui-pillhdr__trail">
          {actions}
          {onClose && (
            <ActionIcon
              className="sui-pillhdr__close"
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
      )}
    </div>
  );
}
