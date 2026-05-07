import React from "react";

function Block({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width: string | number;
  height: string | number;
  borderRadius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: "rgba(0, 0, 0, 0.06)",
        animation: "full-app-skeleton-pulse 1.8s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

/**
 * A top-level loading skeleton that mirrors the shell layout,
 * but avoids provider-bound UI libs so it is safe before providers mount.
 */
export function FullAppSkeleton() {
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 48em)").matches;

  return (
    <div
      style={{
        height: "100dvh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "var(--bg-app, var(--mantine-color-body, #fff))",
      }}
    >
      <style>
        {
          "@keyframes full-app-skeleton-pulse { 0% { opacity: .65; } 50% { opacity: 1; } 100% { opacity: .65; } }"
        }
      </style>

      {isMobile ? (
        <>
          <div
            style={{
              height: "3.5rem",
              borderBottom: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-toolbar, #f8f9fa)",
              display: "flex",
              alignItems: "center",
              padding: "0 1rem",
            }}
          >
            <Block width={120} height={24} borderRadius={4} />
          </div>

          <div
            style={{
              height: "3rem",
              borderBottom: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-toolbar, #f8f9fa)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <Block width={80} height={30} borderRadius={20} />
            <Block width={80} height={30} borderRadius={20} />
          </div>

          <div style={{ flex: 1, overflow: "hidden", padding: "0.75rem" }}>
            <div style={{ display: "grid", gap: "0.6rem" }}>
              <Block width="100%" height={40} />
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: "0.75rem" }}>
                  <Block width={32} height={32} borderRadius={6} />
                  <Block width="100%" height={20} borderRadius={4} />
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              height: "4.5rem",
              borderTop: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-toolbar, #f8f9fa)",
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{ display: "flex", flexDirection: "column", gap: 4 }}
              >
                <Block width={24} height={24} borderRadius={4} />
                <Block width={32} height={10} borderRadius={2} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div
            style={{
              width: "4.5rem",
              borderRight: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-toolbar, #f8f9fa)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: "1rem",
              gap: "1rem",
            }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Block key={i} width={32} height={32} borderRadius={8} />
            ))}
          </div>

          <div
            style={{
              width: "18.5rem",
              borderRight: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-toolbar, #f8f9fa)",
              padding: "0.75rem",
              display: "grid",
              gap: "0.6rem",
            }}
          >
            <Block width="100%" height={40} />
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: "0.75rem" }}>
                <Block width={32} height={32} borderRadius={6} />
                <Block width="100%" height={20} borderRadius={4} />
              </div>
            ))}
          </div>

          <div
            style={{
              flex: 1,
              backgroundColor: "var(--bg-app, #fff)",
              padding: "1rem",
            }}
          >
            <div style={{ display: "grid", gap: "0.9rem" }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Block key={i} width="100%" height={180} />
              ))}
            </div>
          </div>

          <div
            style={{
              width: "3.5rem",
              borderLeft: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-toolbar, #f8f9fa)",
            }}
          />
        </div>
      )}
    </div>
  );
}
