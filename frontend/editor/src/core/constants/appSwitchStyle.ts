/**
 * How the editor <-> processor switch animates. Selectable in Settings >
 * General so the styles can be compared side by side.
 *
 * Every style is two keyframe sets - a departure and an arrival - and the
 * shared wiring in AppSwitchTransition.css plays them forwards on the way out
 * and rewinds them on the way back. A new style only has to name its keyframes.
 */
export type AppSwitchStyle =
  /** Shared horizontal axis: the app pushes off one side, the next arrives from the other. */
  | "axis"
  /** The rails leave through the nearest edge while the middle blurs away. */
  | "panels"
  /** Z-axis: the app recedes and the next one comes forward. */
  | "depth"
  /** No movement at all - one app blurs out as the other blurs in. */
  | "dissolve"
  /** A ground-coloured curtain sweeps across and back. */
  | "wipe";

export const APP_SWITCH_STYLES: readonly AppSwitchStyle[] = [
  "axis",
  "panels",
  "depth",
  "dissolve",
  "wipe",
] as const;

export const DEFAULT_APP_SWITCH_STYLE: AppSwitchStyle = "axis";

/**
 * Which styles hold the brand lockup still across the swap.
 *
 * Off for the two whose whole point is that the chrome itself goes: `panels`
 * slides the rail off screen and `wipe` covers it, so a pinned mark would be
 * left hanging over nothing.
 */
export const APP_SWITCH_PINS_BRAND: Record<AppSwitchStyle, boolean> = {
  axis: true,
  panels: false,
  depth: true,
  dissolve: true,
  wipe: false,
};

export function isAppSwitchStyle(value: unknown): value is AppSwitchStyle {
  return APP_SWITCH_STYLES.includes(value as AppSwitchStyle);
}
