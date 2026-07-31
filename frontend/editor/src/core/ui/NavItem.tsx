import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import "@app/ui/NavItem.css";

export type NavItemAccent = "blue" | "purple" | "green" | "amber" | "red";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "disabled" | "className" | "id" | "aria-label" | "children"
>;

export interface NavItemProps extends NativeButtonProps {
  /** Stable view id passed to the click handler. */
  id: string;
  label: string;
  icon?: ReactNode;
  /** Second icon cross-faded in on hover (e.g. a vendor mark gaining colour). */
  hoverIcon?: ReactNode;
  /** Show the active highlight (primary-subtle background, accent text). */
  isActive?: boolean;
  /** Dimmed and inert, but still hoverable so a tooltip can explain why. */
  disabled?: boolean;
  /** Collapsed rail: icon only; the label stays the accessible name. */
  iconOnly?: boolean;
  /**
   * Optional status accent: draws a left edge bar in the tone colour and tints
   * the leading icon to match. For listing live/paused/etc. entities.
   */
  accent?: NavItemAccent;
  /** Optional trailing badge (e.g. unread count, "new"). */
  trailing?: ReactNode;
  onClick?: (id: string) => void;
  className?: string;
}

/** The shared sidebar navigation row (portal nav, editor file sidebar). */
export const NavItem = forwardRef<HTMLButtonElement, NavItemProps>(
  function NavItem(
    {
      id,
      label,
      icon,
      hoverIcon,
      isActive,
      disabled,
      iconOnly,
      accent,
      trailing,
      onClick,
      className,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={disabled ? undefined : () => onClick?.(id)}
        tabIndex={disabled ? -1 : undefined}
        className={[
          "sui-navitem",
          isActive ? "is-active" : "",
          disabled ? "is-disabled" : "",
          iconOnly ? "sui-navitem--icon-only" : "",
          accent ? "sui-navitem--accent" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-accent={accent}
        aria-current={isActive ? "page" : undefined}
        aria-disabled={disabled || undefined}
        aria-label={label}
        {...rest}
      >
        {icon &&
          (hoverIcon ? (
            <span
              className="sui-navitem__icon sui-navitem__icon--swap"
              aria-hidden
            >
              <span className="sui-navitem__icon-rest">{icon}</span>
              <span className="sui-navitem__icon-hover">{hoverIcon}</span>
            </span>
          ) : (
            <span className="sui-navitem__icon" aria-hidden>
              {icon}
            </span>
          ))}
        {!iconOnly && <span className="sui-navitem__label">{label}</span>}
        {!iconOnly && trailing && (
          <span className="sui-navitem__trailing">{trailing}</span>
        )}
      </button>
    );
  },
);
