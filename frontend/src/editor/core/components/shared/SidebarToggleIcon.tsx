import { Icon } from "@app/ui/Icon";

interface SidebarToggleIconProps {
  /** Square size in px. */
  size?: number;
  /** Put the divided-off rail on the right, for a right-hand panel. */
  mirrored?: boolean;
  className?: string;
}

/**
 * "Toggle sidebar" glyph — a rounded panel with a divided-off left rail — for
 * the processor sidebar's collapse control. Inherits colour via currentColor.
 */
export function SidebarToggleIcon({
  size = 18,
  mirrored = false,
  className,
}: SidebarToggleIconProps) {
  return (
    <Icon
      name={mirrored ? "panel-right" : "panel-left"}
      size={size}
      strokeWidth={2}
      className={className}
    />
  );
}
