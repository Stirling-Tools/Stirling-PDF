import type { ReactNode } from "react";
import "@shared/components/Tabs.css";

export interface TabItem<K extends string = string> {
  /** Stable identifier for the tab. */
  key: K;
  label: ReactNode;
  /** Optional count badge shown to the right of the label. */
  count?: number;
  /** Accent colour applied when this tab is active (override per-tab). */
  accentColor?: string;
  /** Leading dot before the label (used by Document type grid). */
  dotColor?: string;
  disabled?: boolean;
}

export interface TabsProps<K extends string = string> {
  items: TabItem<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  /** Visual treatment. `pill` is rounded-chip style; `underline` is line-under tabs. */
  variant?: "pill" | "underline";
  /** Accessible label for the tablist. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Single-row tab strip. Generic over the key type so callers get strongly
 * typed `onChange` handlers without casting.
 */
export function Tabs<K extends string = string>({
  items,
  activeKey,
  onChange,
  variant = "pill",
  ariaLabel,
  className,
}: TabsProps<K>) {
  return (
    // role="group" + aria-pressed is the right pattern for a filter strip
    // that does not have paired tabpanels. Switching to ARIA tab roles would
    // require ArrowLeft / ArrowRight handling and per-tab tabpanel wiring per
    // the APG — out of scope for what this primitive actually does.
    <div
      className={["sui-tabs", `sui-tabs--${variant}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const isActive = item.key === activeKey;
        const styleVars =
          isActive && item.accentColor
            ? ({ "--sui-tab-accent": item.accentColor } as React.CSSProperties)
            : undefined;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={isActive}
            disabled={item.disabled}
            className={
              "sui-tabs__tab" +
              (isActive ? " is-active" : "") +
              (item.disabled ? " is-disabled" : "")
            }
            style={styleVars}
            onClick={() => onChange(item.key)}
          >
            {item.dotColor && (
              <span
                className="sui-tabs__dot"
                style={{ background: item.dotColor }}
                aria-hidden
              />
            )}
            <span className="sui-tabs__label">{item.label}</span>
            {item.count !== undefined && (
              <span className="sui-tabs__count">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
