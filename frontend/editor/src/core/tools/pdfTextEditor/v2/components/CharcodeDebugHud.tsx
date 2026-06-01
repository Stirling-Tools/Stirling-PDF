import { useEffect, useState, type ReactElement } from "react";
import {
  CharcodeEvent,
  getRecentCharcodeEvents,
  subscribeCharcodeEvents,
} from "@app/tools/pdfTextEditor/v2/charcode/charcodeRegistry";
import { getActiveCharcodeStrategy } from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";

/**
 * Floating debug HUD showing the live charcode-strategy state.
 *
 * Renders fixed in the bottom-right of the editor. Shows:
 *   - The currently active strategy (re-read on every event so a
 *     URL-param or localStorage change is visible without remount).
 *   - The last 8 emit attempts with outcome icon, strategy, input
 *     text, and the resolved charcodes / missing chars.
 *
 * Only mounted when `?charcodeDebug=1` is in the URL or
 * `localStorage.v2.charcodeDebug === "1"` - keeps it out of regular
 * users' way during the comparison phase.
 */

const COLOURS: Record<CharcodeEvent["outcome"], string> = {
  "charcodes-ok": "#1a9b4a", // green: SetCharcodes succeeded
  "charcodes-call-failed": "#c43838", // red: SetCharcodes returned false
  "partial-coverage-fallback": "#d49228", // orange: strategy partial, fell back
  "no-strategy": "#888888", // grey: helvetica mode
  "no-font": "#888888", // grey: fresh emit without source font
};

const OUTCOME_LABEL: Record<CharcodeEvent["outcome"], string> = {
  "charcodes-ok": "OK",
  "charcodes-call-failed": "WASM FAIL",
  "partial-coverage-fallback": "FALLBACK",
  "no-strategy": "NO-STRAT",
  "no-font": "NO-FONT",
};

export function isCharcodeDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("charcodeDebug") === "1") return true;
  } catch {
    /* ignore */
  }
  try {
    return window.localStorage?.getItem("v2.charcodeDebug") === "1";
  } catch {
    return false;
  }
}

export function CharcodeDebugHud(): ReactElement | null {
  const [enabled] = useState<boolean>(() => isCharcodeDebugEnabled());
  const [events, setEvents] = useState<CharcodeEvent[]>(() =>
    getRecentCharcodeEvents(),
  );
  const [activeStrategy, setActiveStrategy] = useState<string>(() =>
    getActiveCharcodeStrategy(),
  );

  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeCharcodeEvents(() => {
      setEvents(getRecentCharcodeEvents());
      // The strategy can flip mid-session if the user uses the
      // toolbar dropdown; re-read on each event so the badge stays
      // honest.
      setActiveStrategy(getActiveCharcodeStrategy());
    });
    return unsub;
  }, [enabled]);

  if (!enabled) return null;

  const tail = events.slice(-8).reverse();
  return (
    <div
      data-testid="v2-charcode-debug-hud"
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        width: 360,
        maxHeight: "60vh",
        overflow: "auto",
        background: "rgba(17, 17, 17, 0.92)",
        color: "#eee",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 11,
        lineHeight: 1.3,
        padding: 10,
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 12,
          marginBottom: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>charcode strategy</span>
        <span
          data-testid="v2-charcode-debug-strategy"
          style={{
            background: "#333",
            padding: "2px 8px",
            borderRadius: 4,
          }}
        >
          {activeStrategy}
        </span>
      </div>
      <div style={{ opacity: 0.7, marginBottom: 8 }}>
        last {tail.length} emit{tail.length === 1 ? "" : "s"} (newest first):
      </div>
      {tail.length === 0 && (
        <div style={{ opacity: 0.6 }}>
          (no emits yet - type into a text run to populate)
        </div>
      )}
      {tail.map((e, i) => (
        <div
          key={`${e.timestamp}-${i}`}
          style={{
            borderTop: i === 0 ? "none" : "1px solid #2a2a2a",
            padding: "5px 0",
          }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span
              style={{
                background: COLOURS[e.outcome],
                color: "#fff",
                padding: "1px 5px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {OUTCOME_LABEL[e.outcome]}
            </span>
            <span style={{ opacity: 0.75 }}>{e.strategy}</span>
            <span style={{ opacity: 0.55 }}>font={e.fontPtr || "0"}</span>
          </div>
          <div style={{ marginTop: 2 }}>text={JSON.stringify(e.text)}</div>
          {e.resolved.length > 0 && (
            <div style={{ marginTop: 2, color: "#9be29b" }}>
              → charcodes [{e.resolved.join(", ")}]
            </div>
          )}
          {e.missing.length > 0 && (
            <div style={{ marginTop: 2, color: "#ffb070" }}>
              missing {JSON.stringify(e.missing)}
            </div>
          )}
          <div style={{ marginTop: 2, opacity: 0.55 }}>{e.note}</div>
        </div>
      ))}
    </div>
  );
}
