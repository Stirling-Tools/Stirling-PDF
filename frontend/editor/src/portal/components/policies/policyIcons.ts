/**
 * Glyphs for the policy catalogue's string icon keys. The catalogue model
 * carries semantic keys (e.g. "shield", "layers") rather than React nodes so
 * the data stays portable; the portal owns the rendering and maps each key to a
 * glyph here.
 */
export const POLICY_ICON_GLYPHS: Record<string, string> = {
  layers: "▤",
  shield: "🛡",
  check: "✓",
  route: "⇉",
  clock: "⏲",
  // Source icons.
  file: "▢",
  device: "▣",
  globe: "◍",
  cloud: "☁",
  mail: "✉",
  folder: "▤",
};

/** Resolve an icon key to its glyph, falling back to a neutral dot. */
export function policyIcon(key: string): string {
  return POLICY_ICON_GLYPHS[key] ?? "•";
}
