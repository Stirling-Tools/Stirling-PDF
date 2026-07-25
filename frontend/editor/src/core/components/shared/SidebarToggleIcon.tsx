interface SidebarToggleIconProps {
  /** Square size in px. */
  size?: number;
  className?: string;
}

/**
 * "Toggle sidebar" glyph — a rounded panel with a divided-off left rail —
 * shared by the editor FileSidebar and the processor Sidebar so their
 * collapse/expand controls read identically. Inherits colour via currentColor.
 */
export function SidebarToggleIcon({
  size = 18,
  className,
}: SidebarToggleIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <line x1="9.5" y1="4" x2="9.5" y2="20" />
    </svg>
  );
}
