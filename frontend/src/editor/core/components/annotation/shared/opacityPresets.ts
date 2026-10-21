/**
 * The stops drawn on the opacity track. They are marks, not the only choices:
 * the track itself takes any whole percent, so a document arriving at its own
 * opacity keeps it.
 */
export const OPACITY_PRESETS = [25, 50, 75, 100] as const;
