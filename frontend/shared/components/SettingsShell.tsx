import type { ReactNode } from "react";
import { Button } from "@shared/components/Button";
import "@shared/components/SettingsShell.css";

export interface SettingsNavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Trailing badge (e.g. plan gate or count). */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface SettingsNavSection {
  title: string;
  items: SettingsNavItem[];
}

export interface SettingsShellProps {
  sections: SettingsNavSection[];
  activeKey: string;
  onSelect: (key: string) => void;
  title: ReactNode;
  onClose?: () => void;
  /** Rendered left of the close button. */
  headerActions?: ReactNode;
  /** Sticky footer (e.g. Save / Cancel). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Two-pane settings layout. Fills its container; both panes scroll independently. */
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
              <Button
                variant="tertiary"
                shape="circle"
                className="sui-settings-shell__close"
                onClick={onClose}
                aria-label="Close"
                leftSection={
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
                }
              />
            )}
          </div>
        </header>

        <div className="sui-settings-shell__body">{children}</div>

        {footer && <div className="sui-settings-shell__footer">{footer}</div>}
      </div>
    </div>
  );
}
