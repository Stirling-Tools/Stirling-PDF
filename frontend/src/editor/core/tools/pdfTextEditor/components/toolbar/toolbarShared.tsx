import type { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";

export type Controller = ReturnType<typeof useToolbarController>;

export const NO_SHRINK = { flexShrink: 0 } as const;

/** Marks a menu opened from the selection bar, which portals outside the bar; the bar holds still while one has focus. */
export const SELECTION_BAR_MENU_ATTR = "data-selection-bar-menu";
export const selectionBarMenuProps = { [SELECTION_BAR_MENU_ATTR]: "" };

/** A style toggle's look: filled when the whole selection has the style, outlined when only some of it does. */
export function toggleLook(on: boolean, mixed: boolean) {
  if (mixed) return { variant: "secondary", accent: "default" } as const;
  return on
    ? ({ variant: "primary", accent: "default" } as const)
    : ({ variant: "tertiary", accent: "neutral" } as const);
}

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
