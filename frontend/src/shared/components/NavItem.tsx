import type { ReactNode } from 'react';
import '@shared/components/NavItem.css';

export interface NavItemProps {
  /** Stable view id passed to the click handler. */
  id: string;
  label: string;
  icon?: ReactNode;
  /** Show the active highlight (navActive background, navActiveText colour). */
  isActive?: boolean;
  /** Optional trailing badge (e.g. unread count, "new"). */
  trailing?: ReactNode;
  onClick?: (id: string) => void;
  className?: string;
}

/**
 * Sidebar navigation row matching the prototype's hover + active styling.
 *
 * Active styling: navActive background, navActiveText colour, weight 500.
 * Hover styling: navHover background, navHoverText colour (only when not
 * already active).
 */
export function NavItem({ id, label, icon, isActive, trailing, onClick, className }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(id)}
      className={['sui-navitem', isActive ? 'is-active' : '', className ?? ''].filter(Boolean).join(' ')}
      aria-current={isActive ? 'page' : undefined}
    >
      {icon && <span className="sui-navitem__icon" aria-hidden>{icon}</span>}
      <span className="sui-navitem__label">{label}</span>
      {trailing && <span className="sui-navitem__trailing">{trailing}</span>}
    </button>
  );
}
