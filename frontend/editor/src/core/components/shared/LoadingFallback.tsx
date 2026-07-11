/**
 * Loading fallback component for i18next suspense
 */
export function LoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontSize: "18px",
        // Theme-aware so the splash follows light/dark instead of forcing white.
        backgroundColor: "var(--mantine-color-body)",
        color: "var(--mantine-color-text)",
      }}
    >
      Loading...
    </div>
  );
}
