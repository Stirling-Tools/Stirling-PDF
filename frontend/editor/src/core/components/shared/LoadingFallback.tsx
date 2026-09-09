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
        // Use our own tokens, not --mantine-color-*: this splash renders inside
        // Suspense before MantineProvider sets its scheme, so --mantine-color-body
        // is still Mantine's light default (white flash in dark mode). --c-bg/
        // --c-text come from the pre-paint attributes on <html>, so they're right.
        backgroundColor: "var(--c-bg)",
        color: "var(--c-text)",
      }}
    >
      Loading...
    </div>
  );
}
