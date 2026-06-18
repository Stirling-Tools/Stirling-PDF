import type { ReactNode } from "react";
import "@shared/components/SettingsShell.css";

export interface SettingsNavItem {
  key: string;
  label: string;
  /** Optional leading glyph. */
  icon?: ReactNode;
  /** Optional trailing badge (e.g. a plan gate or count). */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface SettingsNavSection {
  /** Uppercase group heading above its items. */
  title: string;
  items: SettingsNavItem[];
}

export interface SettingsShellProps {
  sections: SettingsNavSection[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Heading for the content pane — usually the active item's label. */
  title: ReactNode;
  /** Renders a close button at the top-right of the content header. */
  onClose?: () => void;
  /** Extra header controls (e.g. a search field) left of the close button. */
  headerActions?: ReactNode;
  /** Sticky footer, e.g. Save / Cancel. */
  footer?: ReactNode;
  /** Active section content. */
  children: ReactNode;
  className?: string;
}

/**
 * Two-pane settings layout: a grouped left navigation rail and a content pane
 * with a sticky header (active title + actions) and an optional sticky footer.
 *
 * Layout chrome only — the caller owns section state and renders the active
 * panel as `children`. Host it inside any modal/dialog frame (it fills its
 * container's height and scrolls the two panes independently). Shared so the
 * portal and the editor can present account settings the same way.
 */
export function SettingsShell({
  sections,
  activeKey,
  onSelect,
  title,
  onClose,
  headerActions,
  footer,
  children,
  className,
}: SettingsShellProps) {
  return (
    <div
      className={["sui-settings-shell", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <nav className="sui-settings-shell__nav" aria-label="Settings sections">
        {sections.map((section) => (
          <div key={section.title} className="sui-settings-shell__group">
            <span className="sui-settings-shell__group-title">
              {section.title}
            </span>
            {section.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className={
                  "sui-settings-shell__item" +
                  (item.key === activeKey ? " is-active" : "")
                }
                aria-current={item.key === activeKey ? "page" : undefined}
                disabled={item.disabled}
                onClick={() => onSelect(item.key)}
              >
                {item.icon && (
                  <span className="sui-settings-shell__item-icon" aria-hidden>
                    {item.icon}
                  </span>
                )}
                <span className="sui-settings-shell__item-label">
                  {item.label}
                </span>
                {item.badge && (
                  <span className="sui-settings-shell__item-badge">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sui-settings-shell__content">
        <header className="sui-settings-shell__header">
          <span className="sui-settings-shell__title">{title}</span>
          <div className="sui-settings-shell__header-actions">
            {headerActions}
            {onClose && (
              <button
                type="button"
                className="sui-settings-shell__close"
                onClick={onClose}
                aria-label="Close"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </header>

        <div className="sui-settings-shell__body">{children}</div>

        {footer && <div className="sui-settings-shell__footer">{footer}</div>}
      </div>
    </div>
  );
}
