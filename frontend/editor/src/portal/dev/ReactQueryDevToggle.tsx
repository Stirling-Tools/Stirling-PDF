import { Button } from "@app/ui";
import { setFlag, useFeatureFlag } from "@portal/dev/featureFlags";

/**
 * Dev-only, on-page switch for the `reactQuery` flag, so the Users page's data
 * layer can be flipped between the legacy fetch-on-mount path and TanStack
 * Query without a reload or a rebuild. Fixed to the bottom-right; intentionally
 * unstyled by the design system so it reads as scaffolding, not product UI.
 *
 * Remove this (and the flag) once the evaluation is done.
 */
export function ReactQueryDevToggle() {
  const enabled = useFeatureFlag("reactQuery");
  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 8,
        fontSize: 12,
        fontFamily: "ui-monospace, monospace",
        color: "#fff",
        background: enabled ? "#1d4ed8" : "#444",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <span>
        Users data: <strong>{enabled ? "React Query" : "Legacy"}</strong>
      </span>
      <Button
        variant="secondary"
        onClick={() => setFlag("reactQuery", !enabled)}
      >
        {enabled ? "Use legacy" : "Use React Query"}
      </Button>
    </div>
  );
}
