import { connectionModeService } from "@editor/services/connectionModeService";
import { connectedServerBaseUrl } from "@editor/services/connectedServerBaseUrl";

/**
 * The app bundle carries no font set and a phone has no bundled backend, so the
 * fallback fonts come from the connected server's /fonts. Empty with no server
 * connected; the engine then falls back to same-origin URLs, which fail gracefully.
 */
export function getFontBaseUrl(): string {
  const base = connectedServerBaseUrl();
  return base ? `${base}/fonts` : "";
}

/**
 * Fires when the font base actually moves: once the stored connection first loads
 * (that load notifies no one), and on every later server switch.
 */
export function subscribeToFontBaseUrl(onChange: () => void): () => void {
  let previous = getFontBaseUrl();
  const recheck = () => {
    const next = getFontBaseUrl();
    if (next === previous) return;
    previous = next;
    onChange();
  };
  void connectionModeService.getCurrentMode().then(recheck, () => {});
  return connectionModeService.subscribeToModeChanges(recheck);
}
