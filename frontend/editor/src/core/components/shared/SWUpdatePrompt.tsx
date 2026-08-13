import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * User-facing service-worker update prompt. The SW is registered with
 * skipWaiting: false, so an update stays dormant until the user accepts it
 * here; never mid-session, never while a PDF operation is in flight.
 */
export function SWUpdatePrompt() {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisterError(error: Error) {
      console.warn("[sw] registration failed:", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 9999,
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "10px 16px",
        borderRadius: 8,
        background: "var(--c-surface-raised)",
        color: "var(--c-text)",
        border: "1px solid var(--c-border)",
        fontSize: 14,
      }}
    >
      <span>A new version is available.</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          border: "none",
          cursor: "pointer",
          background: "var(--c-accent-solid)",
          color: "var(--c-accent-fg)",
        }}
      >
        Update
      </button>
    </div>
  );
}
