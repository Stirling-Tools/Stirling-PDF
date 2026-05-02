/**
 * Loading fallback component for i18next suspense and lazy components.
 * Uses 100% height to fill its parent container without causing layout shifts
 * by forcing a 100vh height in contained areas.
 */
export function LoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        width: "100%",
        minHeight: "200px",
        fontSize: "18px",
        color: "var(--text-muted, #666)",
        background: "transparent",
      }}
    >
      <div className="animate-pulse">Loading...</div>
    </div>
  );
}
