import { useEffect, useSyncExternalStore } from "react";

export type ToolPanelSize = "sm" | "md" | "lg";

/** md and lg are sm grown by 25% and 50%, rounded to whole rems. */
export const TOOL_PANEL_WIDTHS: Record<ToolPanelSize, string> = {
  sm: "18.5rem",
  md: "23rem",
  lg: "28rem",
};

let currentSize: ToolPanelSize = "sm";
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Sets the desktop tool panel width until something sets it again. */
export function setToolPanelSize(size: ToolPanelSize): void {
  if (size === currentSize) return;
  currentSize = size;
  listeners.forEach((listener) => listener());
}

/**
 * Holds the tool panel at `size` while mounted, then returns it to sm. React runs an outgoing
 * tool's cleanup before the incoming tool's effect, so the incoming tool's size wins.
 */
export function useToolPanelSize(size: ToolPanelSize): void {
  useEffect(() => {
    setToolPanelSize(size);
    return () => setToolPanelSize("sm");
  }, [size]);
}

/** The desktop tool panel's current width, as a CSS length. */
export function useToolPanelWidth(): string {
  return TOOL_PANEL_WIDTHS[useSyncExternalStore(subscribe, () => currentSize)];
}
