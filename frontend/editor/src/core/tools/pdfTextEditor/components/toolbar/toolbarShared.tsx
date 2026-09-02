import type { useToolbarController } from "@app/tools/pdfTextEditor/hooks/useToolbarController";

export type Controller = ReturnType<typeof useToolbarController>;

/** Toolbar children keep their natural width; the strip scrolls if pressed. */
export const NO_SHRINK = { flexShrink: 0 } as const;

/** Hairline between two groups of toolbar controls. */
export function ToolbarSeparator() {
  return (
    <span
      aria-hidden
      style={{
        ...NO_SHRINK,
        width: "0.0625rem",
        alignSelf: "stretch",
        margin: "0.25rem 0.125rem",
        background: "var(--c-border-subtle)",
      }}
    />
  );
}
