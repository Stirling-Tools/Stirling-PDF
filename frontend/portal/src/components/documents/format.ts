import type { StatusTone } from "@shared/components";

/** Format a 0–1 confidence fraction as a whole-percent string. */
export function confidencePct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * Tone for a confidence value. The bands match the review thresholds: below
 * 60% is unreliable (danger), 60–85% warrants a glance (warning), above is
 * trusted (success).
 */
export function confidenceTone(n: number): StatusTone {
  if (n < 0.6) return "danger";
  if (n < 0.85) return "warning";
  return "success";
}

/** Window a freshly granted elevation stays valid, in seconds. */
export const ELEVATION_WINDOW_SECONDS = 15 * 60;

/** Format remaining elevation seconds as M:SS for the countdown banner. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
