/**
 * Opacity is chosen from presets rather than dragged.
 *
 * A drag commits an annotation update on every pointer move, and each update
 * rebuilds the mark's menu. Replacing the slider with discrete choices removes
 * that per-move work entirely, which is what made adjusting opacity the most
 * visible source of flicker.
 */
export const OPACITY_PRESETS = [25, 50, 75, 100] as const;

export type OpacityPreset = (typeof OPACITY_PRESETS)[number];

/**
 * The preset a given opacity rounds to, so the control always shows a selection.
 * A value between presets — one set by a document that arrived with its own
 * opacity — lands on the nearest one rather than leaving the control blank. An
 * exact tie rounds up.
 */
export function nearestOpacityPreset(value: number): OpacityPreset {
  let nearest: OpacityPreset = OPACITY_PRESETS[0];
  for (const preset of OPACITY_PRESETS) {
    if (Math.abs(preset - value) <= Math.abs(nearest - value)) nearest = preset;
  }
  return nearest;
}
